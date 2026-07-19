import { RaceDataSource, RaceFrame } from "../RaceDataSource";
import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { RaceEvent } from "../RaceEvent";
import { RaceEventPriority } from "../RaceEventPriority";
import { RaceEventType } from "../RaceEventType";
import {
  buildOpenF1Index,
  normalizeOpenF1SnapshotAt,
  OpenF1Index,
} from "./OpenF1Normalizer";
import { OpenF1SessionData } from "./OpenF1Types";

const EVENT_SCHEMA_VERSION = 1;

// 컴팩트한 OpenF1 재생 데이터. 프레임에는 스냅샷만, 이벤트는 전역으로 1회만 담아
// fixture 크기를 줄인다.
export type OpenF1RecordingFrame = {
  atSecond: number;
  snapshot: LiveRaceSnapshot;
};

export type OpenF1TimedEvent = {
  atSecond: number;
  event: RaceEvent;
};

export type OpenF1Recording = {
  sessionId: string;
  durationSeconds: number;
  cadenceSeconds: number;
  frames: OpenF1RecordingFrame[];
  events: OpenF1TimedEvent[];
};

const parseMs = (date: string | null): number =>
  date === null ? Number.NaN : Date.parse(date);

const stintCompoundAtLap = (
  data: OpenF1SessionData,
  driverNumber: number,
  lap: number,
): string | null => {
  let compound: string | null = null;

  for (const stint of data.stints) {
    if (stint.driver_number === driverNumber && stint.lap_start <= lap) {
      compound = stint.compound;
    }
  }

  return compound;
};

const makeEvent = (
  sessionId: string,
  type: RaceEventType,
  priority: RaceEventPriority,
  atMs: number,
  parts: {
    driverNumber?: number;
    lapNumber?: number;
    params: RaceEvent["params"];
    key: string;
  },
): RaceEvent => {
  const deduplicationKey = `${sessionId}:${type}:${parts.key}`;
  const event: RaceEvent = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    id: deduplicationKey,
    sessionId,
    type,
    priority,
    timestamp: new Date(atMs).toISOString(),
    params: parts.params,
    deduplicationKey,
  };

  if (parts.driverNumber !== undefined) {
    event.driverNumber = parts.driverNumber;
  }

  if (parts.lapNumber !== undefined) {
    event.lapNumber = parts.lapNumber;
  }

  return event;
};

// pit / race_control / fastest lap 로부터 이벤트를 생성한다 (type + params 저장).
const buildEvents = (
  data: OpenF1SessionData,
  startMs: number,
  endMs: number,
): OpenF1TimedEvent[] => {
  const sessionId = data.meta.sessionId;
  const codeOf = new Map(
    data.drivers.map((driver) => [driver.driver_number, driver.name_acronym]),
  );
  const timed: OpenF1TimedEvent[] = [];

  const push = (atMs: number, event: RaceEvent): void => {
    if (atMs < startMs || atMs > endMs) {
      return;
    }

    timed.push({ atSecond: (atMs - startMs) / 1000, event });
  };

  // 피트스톱
  for (const pit of data.pits) {
    const atMs = parseMs(pit.date);

    if (Number.isNaN(atMs)) {
      continue;
    }

    const compound = stintCompoundAtLap(data, pit.driver_number, pit.lap_number + 1);

    push(
      atMs,
      makeEvent(sessionId, RaceEventType.PitStop, RaceEventPriority.High, atMs, {
        driverNumber: pit.driver_number,
        lapNumber: pit.lap_number,
        key: `${pit.driver_number}:${pit.lap_number}`,
        params: {
          driverCode: codeOf.get(pit.driver_number) ?? "",
          compound: compound ?? "UNKNOWN",
        },
      }),
    );
  }

  // race_control 상태 전이
  let greenSeen = false;

  for (const message of data.raceControl) {
    const atMs = parseMs(message.date);

    if (Number.isNaN(atMs)) {
      continue;
    }

    const text = message.message.toUpperCase();

    if (message.category === "SafetyCar") {
      if (text.includes("VIRTUAL") && text.includes("DEPLOYED")) {
        push(atMs, makeEvent(sessionId, RaceEventType.VirtualSafetyCar, RaceEventPriority.Critical, atMs, { key: `vsc:${atMs}`, params: {} }));
      } else if (!text.includes("VIRTUAL") && text.includes("DEPLOYED")) {
        push(atMs, makeEvent(sessionId, RaceEventType.SafetyCar, RaceEventPriority.Critical, atMs, { key: `sc:${atMs}`, params: {} }));
      } else if (text.includes("IN THIS LAP") || text.includes("ENDING")) {
        push(atMs, makeEvent(sessionId, RaceEventType.SessionRestarted, RaceEventPriority.High, atMs, { key: `restart:${atMs}`, params: {} }));
      }

      continue;
    }

    if (message.flag === "RED") {
      push(atMs, makeEvent(sessionId, RaceEventType.RedFlag, RaceEventPriority.Critical, atMs, { key: `red:${atMs}`, params: {} }));
    } else if (message.flag === "CHEQUERED") {
      push(atMs, makeEvent(sessionId, RaceEventType.SessionFinished, RaceEventPriority.High, atMs, { key: `finish:${atMs}`, params: {} }));
    } else if (message.scope === "Track" && (message.flag === "YELLOW" || message.flag === "DOUBLE YELLOW")) {
      push(atMs, makeEvent(sessionId, RaceEventType.YellowFlag, RaceEventPriority.High, atMs, { key: `yellow:${atMs}`, params: {} }));
    } else if (
      !greenSeen &&
      message.scope === "Track" &&
      message.flag === "GREEN"
    ) {
      greenSeen = true;
      push(atMs, makeEvent(sessionId, RaceEventType.SessionStarted, RaceEventPriority.Medium, atMs, { key: "start", params: {} }));
    }
  }

  // 전체 최속 랩
  let fastestDriver: number | null = null;
  let fastestTime = Number.POSITIVE_INFINITY;
  let fastestMs = Number.NaN;

  for (const lap of data.laps) {
    if (
      lap.lap_duration !== null &&
      lap.lap_duration < fastestTime &&
      lap.date_start !== null
    ) {
      fastestTime = lap.lap_duration;
      fastestDriver = lap.driver_number;
      fastestMs = parseMs(lap.date_start);
    }
  }

  if (fastestDriver !== null && !Number.isNaN(fastestMs)) {
    push(
      fastestMs,
      makeEvent(sessionId, RaceEventType.FastestLap, RaceEventPriority.Medium, fastestMs, {
        driverNumber: fastestDriver,
        key: `fastest:${fastestDriver}`,
        params: {
          driverCode: codeOf.get(fastestDriver) ?? "",
          lapTimeSeconds: Number(fastestTime.toFixed(3)),
        },
      }),
    );
  }

  return timed.sort((a, b) => a.atSecond - b.atSecond);
};

export type OpenF1LiveFrame = {
  snapshot: LiveRaceSnapshot;
  events: RaceEvent[];
};

export type BuildLiveFrameOptions = {
  startMs: number;
  nowMs: number;
  version?: number;
};

// 라이브 폴링용: 최신 OpenF1 데이터에서 "현재 시점" 스냅샷 + 누적 이벤트를 만든다.
// 녹화(buildOpenF1Recording)와 동일한 정규화 로직을 공유한다.
export const buildOpenF1LiveFrame = (
  data: OpenF1SessionData,
  options: BuildLiveFrameOptions,
): OpenF1LiveFrame => {
  const index = buildOpenF1Index(data);
  const snapshot = normalizeOpenF1SnapshotAt(
    index,
    options.nowMs,
    options.version ?? 0,
  );
  const events = buildEvents(data, options.startMs, options.nowMs).map(
    (timed) => timed.event,
  );

  return { snapshot, events };
};

export type BuildRecordingOptions = {
  startMs: number;
  endMs: number;
  cadenceMs: number;
};

// OpenF1 원본 → 컴팩트 재생 데이터. 캡처 스크립트가 1회 실행해 fixture 로 저장한다.
export const buildOpenF1Recording = (
  data: OpenF1SessionData,
  options: BuildRecordingOptions,
): OpenF1Recording => {
  const index: OpenF1Index = buildOpenF1Index(data);
  const frames: OpenF1RecordingFrame[] = [];
  let version = 0;

  for (let atMs = options.startMs; atMs <= options.endMs; atMs += options.cadenceMs) {
    frames.push({
      atSecond: (atMs - options.startMs) / 1000,
      snapshot: normalizeOpenF1SnapshotAt(index, atMs, version),
    });
    version += 1;
  }

  return {
    sessionId: data.meta.sessionId,
    durationSeconds: (options.endMs - options.startMs) / 1000,
    cadenceSeconds: options.cadenceMs / 1000,
    frames,
    events: buildEvents(data, options.startMs, options.endMs),
  };
};

// 컴팩트 재생 데이터를 RaceDataSource 로 재생한다.
// snapshot 시각은 재생 시작 시각 기준으로 재기록해 freshness 를 live 로 유지한다.
export class OpenF1ReplaySource implements RaceDataSource {
  private readonly recording: OpenF1Recording;
  private readonly startEpochMs: number;

  constructor(recording: OpenF1Recording, startEpochMs: number) {
    if (recording.frames.length === 0) {
      throw new Error("recording must contain at least one frame");
    }

    this.recording = recording;
    this.startEpochMs = startEpochMs;
  }

  get durationSeconds(): number {
    return this.recording.durationSeconds;
  }

  frameAt(elapsedSeconds: number): RaceFrame {
    const first = this.recording.frames[0];

    if (first === undefined) {
      throw new Error("recording must contain at least one frame");
    }

    let selected = first;

    for (const frame of this.recording.frames) {
      if (frame.atSecond <= elapsedSeconds) {
        selected = frame;
      } else {
        break;
      }
    }

    const iso = new Date(
      this.startEpochMs + selected.atSecond * 1000,
    ).toISOString();

    const events = this.recording.events
      .filter((timed) => timed.atSecond <= elapsedSeconds)
      .map((timed) => timed.event);

    return {
      snapshot: { ...selected.snapshot, sourceUpdatedAt: iso, generatedAt: iso },
      events,
    };
  }
}
