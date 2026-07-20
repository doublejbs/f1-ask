import { RaceDataSource, RaceFrame } from "../RaceDataSource";
import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { RaceEvent, RaceEventParams } from "../RaceEvent";
import { RaceEventPriority } from "../RaceEventPriority";
import { RaceEventType } from "../RaceEventType";
import { RetirementReason } from "../RetirementReason";
import { buildDrsWindow } from "./OpenF1DrsWindow";
import { makeEvent, TimedRaceEvent } from "./OpenF1EventFactory";
import {
  buildOpenF1Index,
  normalizeOpenF1SnapshotAt,
  OpenF1Index,
} from "./OpenF1Normalizer";
import { buildRaceControlEvents } from "./OpenF1RaceControlEvents";
import { OpenF1RaceControl, OpenF1SessionData } from "./OpenF1Types";

// 볼륨 상한. 드라이버 자기 최속·팀 라디오·간격 축소는 그대로 두면 피드를 덮어버린다.
const MAX_PERSONAL_BEST_PER_DRIVER = 3;
const MAX_TEAM_RADIO_PER_DRIVER = 5;
const MAX_GAP_CLOSING_PER_DRIVER = 5;
const MAX_DRS_RANGE_PER_DRIVER = 5;
const MAX_STRATEGY_NOTE_PER_DRIVER = 3;
const GAP_CLOSING_THRESHOLD_SECONDS = 1;
const GAP_CLOSING_COOLDOWN_MS = 60_000;
// 필드 다수 컴파운드를 논하려면 최소 이만큼의 표본이 필요하다.
const MIN_STRATEGY_FIELD_SAMPLE = 3;

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

// 숫자 간격만 취한다("+1 LAP" 같은 문자열·null 은 비교 불가).
const parseInterval = (value: number | string | null): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

// race_control 은 상태 전이 dedup 이 시간 순서에 전적으로 의존한다.
// 응답이 한 번이라도 어긋난 순서로 오면 옐로/클리어 쌍이 조용히 뒤집히므로
// laps / intervals 와 동일하게 시각 기준으로 정렬한 뒤 소비한다.
const sortRaceControlByTime = (
  messages: OpenF1RaceControl[],
): OpenF1RaceControl[] =>
  messages
    .map((message) => ({ message, atMs: parseMs(message.date) }))
    .filter((entry) => !Number.isNaN(entry.atMs))
    .sort((a, b) => a.atMs - b.atMs)
    .map((entry) => entry.message);

// pit / race_control / laps / intervals / team_radio / session_result 로부터
// 이벤트를 생성한다 (번역된 문장이 아니라 type + params 로 저장한다).
export const buildEvents = (
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

  // 실제 추월 이벤트 (OpenF1 overtakes 엔드포인트).
  for (const overtake of data.overtakes ?? []) {
    const atMs = parseMs(overtake.date);

    if (Number.isNaN(atMs)) {
      continue;
    }

    push(
      atMs,
      makeEvent(sessionId, RaceEventType.Overtake, RaceEventPriority.High, atMs, {
        driverNumber: overtake.overtaking_driver_number,
        targetDriverNumber: overtake.overtaken_driver_number,
        key: `overtake:${atMs}:${overtake.overtaking_driver_number}:${overtake.overtaken_driver_number}`,
        params: {
          driverCode: codeOf.get(overtake.overtaking_driver_number) ?? "",
          targetDriverCode: codeOf.get(overtake.overtaken_driver_number) ?? "",
          newPosition: overtake.position,
        },
      }),
    );
  }

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

  // race_control 상태 전이 (category → flag → scope 구조화 분기)
  const sortedRaceControl = sortRaceControlByTime(data.raceControl);

  for (const timed of buildRaceControlEvents(sessionId, sortedRaceControl, codeOf)) {
    push(timed.atMs, timed.event);
  }

  // 드라이버당 최근 N건만 남기고 시간 창 안의 것만 발행한다.
  const pushLatestPerDriver = (
    byDriver: Map<number, TimedRaceEvent[]>,
    limit: number,
  ): void => {
    for (const entries of byDriver.values()) {
      for (const entry of entries.slice(-limit)) {
        push(entry.atMs, entry.event);
      }
    }
  };

  const withinWindow = (atMs: number): boolean =>
    !Number.isNaN(atMs) && atMs >= startMs && atMs <= endMs;

  // 드라이버별 자기 최속 갱신 (첫 랩은 기준선이므로 이벤트가 아니다)
  const personalBests = new Map<number, TimedRaceEvent[]>();
  const bestByDriver = new Map<number, number>();
  const timedLaps = data.laps
    .map((lap) => ({ lap, atMs: parseMs(lap.date_start) }))
    .filter((entry) => !Number.isNaN(entry.atMs))
    .sort((a, b) => a.atMs - b.atMs);

  for (const { lap, atMs } of timedLaps) {
    const duration = lap.lap_duration;

    if (duration === null || !Number.isFinite(duration)) {
      continue;
    }

    const previous = bestByDriver.get(lap.driver_number);

    bestByDriver.set(
      lap.driver_number,
      previous === undefined ? duration : Math.min(previous, duration),
    );

    if (previous === undefined || duration >= previous) {
      continue;
    }

    if (!withinWindow(atMs)) {
      continue;
    }

    const entries = personalBests.get(lap.driver_number) ?? [];

    entries.push({
      atMs,
      event: makeEvent(
        sessionId,
        RaceEventType.PersonalBestLap,
        RaceEventPriority.Low,
        atMs,
        {
          driverNumber: lap.driver_number,
          lapNumber: lap.lap_number,
          key: `personal_best:${lap.driver_number}:${lap.lap_number}`,
          params: {
            driverCode: codeOf.get(lap.driver_number) ?? "",
            lapTimeSeconds: Number(duration.toFixed(3)),
          },
        },
      ),
    });
    personalBests.set(lap.driver_number, entries);
  }

  pushLatestPerDriver(personalBests, MAX_PERSONAL_BEST_PER_DRIVER);

  // 팀 라디오 게시
  const teamRadios = new Map<number, TimedRaceEvent[]>();

  for (const radio of data.teamRadio ?? []) {
    const atMs = parseMs(radio.date);

    if (!withinWindow(atMs)) {
      continue;
    }

    const entries = teamRadios.get(radio.driver_number) ?? [];

    entries.push({
      atMs,
      event: makeEvent(
        sessionId,
        RaceEventType.TeamRadioPosted,
        RaceEventPriority.Low,
        atMs,
        {
          driverNumber: radio.driver_number,
          key: `team_radio:${radio.driver_number}:${atMs}`,
          params: {
            driverCode: codeOf.get(radio.driver_number) ?? "",
            recordingUrl: radio.recording_url,
          },
        },
      ),
    });
    teamRadios.set(radio.driver_number, entries);
  }

  pushLatestPerDriver(teamRadios, MAX_TEAM_RADIO_PER_DRIVER);

  // 앞차와의 간격이 1.0초 미만으로 "진입"하는 순간만 이벤트로 만든다.
  //
  // GapClosing 과 DrsRangeEntered 는 같은 순간을 가리키므로 둘 다 발행하면 피드가
  // 중복된다. DRS 활성 구간이면 DrsRangeEntered, 아니면 GapClosing 으로 **하나만**
  // 발행해 상호 배타로 수렴시킨다.
  const gapClosings = new Map<number, TimedRaceEvent[]>();
  const drsRangeEntries = new Map<number, TimedRaceEvent[]>();
  const withinRangeByDriver = new Map<number, boolean>();
  const lastGapEventMsByDriver = new Map<number, number>();
  const drsWindow = buildDrsWindow(sortedRaceControl);
  const timedIntervals = data.intervals
    .map((interval) => ({ interval, atMs: parseMs(interval.date) }))
    .filter((entry) => !Number.isNaN(entry.atMs))
    .sort((a, b) => a.atMs - b.atMs);

  // intervals 를 시간 순으로 훑으면서 같은 시각의 포지션·랩 상태를 함께 전진시킨다.
  const timedPositions = data.positions
    .map((position) => ({ position, atMs: parseMs(position.date) }))
    .filter((entry) => !Number.isNaN(entry.atMs))
    .sort((a, b) => a.atMs - b.atMs);
  const positionByDriver = new Map<number, number>();
  let positionCursor = 0;
  let lapCursor = 0;
  let currentLapNumber: number | null = null;

  const advancePositionsUntil = (untilMs: number): void => {
    while (positionCursor < timedPositions.length) {
      const entry = timedPositions[positionCursor];

      if (entry === undefined || entry.atMs > untilMs) {
        break;
      }

      positionByDriver.set(
        entry.position.driver_number,
        entry.position.position,
      );
      positionCursor += 1;
    }
  };

  const advanceLapsUntil = (untilMs: number): void => {
    while (lapCursor < timedLaps.length) {
      const entry = timedLaps[lapCursor];

      if (entry === undefined || entry.atMs > untilMs) {
        break;
      }

      currentLapNumber = Math.max(currentLapNumber ?? 0, entry.lap.lap_number);
      lapCursor += 1;
    }
  };

  // intervals.interval 은 "바로 앞차와의 간격"이므로 같은 시각의 position - 1 이 앞차다.
  const findDriverAhead = (driverNumber: number): number | null => {
    const position = positionByDriver.get(driverNumber);

    if (position === undefined || position <= 1) {
      return null;
    }

    for (const [candidate, candidatePosition] of positionByDriver) {
      if (candidatePosition === position - 1) {
        return candidate;
      }
    }

    return null;
  };

  for (const { interval, atMs } of timedIntervals) {
    advancePositionsUntil(atMs);
    advanceLapsUntil(atMs);

    const gap = parseInterval(interval.interval);

    if (gap === null) {
      continue;
    }

    const driverNumber = interval.driver_number;
    const inRange = gap < GAP_CLOSING_THRESHOLD_SECONDS;
    const wasInRange = withinRangeByDriver.get(driverNumber) ?? false;

    withinRangeByDriver.set(driverNumber, inRange);

    if (!inRange || wasInRange) {
      continue;
    }

    const lastEventMs = lastGapEventMsByDriver.get(driverNumber);

    // 동일 드라이버가 경계를 오가며 반복 진입하는 것을 쿨다운으로 억제한다.
    if (lastEventMs !== undefined && atMs - lastEventMs < GAP_CLOSING_COOLDOWN_MS) {
      continue;
    }

    lastGapEventMsByDriver.set(driverNumber, atMs);

    if (!withinWindow(atMs)) {
      continue;
    }

    const aheadDriverNumber = findDriverAhead(driverNumber);
    const aheadDriverCode =
      aheadDriverNumber === null ? undefined : codeOf.get(aheadDriverNumber);
    // 앞차를 특정하지 못하면 키 자체를 담지 않는다(빈 문자열을 UI 에 노출하지 않는다).
    const aheadParams: RaceEventParams =
      aheadDriverCode === undefined || aheadDriverCode === ""
        ? {}
        : { aheadDriverCode };

    const inDrsWindow = drsWindow.isActiveAt(atMs, currentLapNumber);
    const type = inDrsWindow
      ? RaceEventType.DrsRangeEntered
      : RaceEventType.GapClosing;
    const bucket = inDrsWindow ? drsRangeEntries : gapClosings;
    const entries = bucket.get(driverNumber) ?? [];
    // DrsRangeEntered 는 "누구에 대해" DRS 권 안인지가 핵심이라 앞차를 추격 대상으로도 담는다.
    const targetParams: RaceEventParams =
      inDrsWindow && aheadDriverCode !== undefined && aheadDriverCode !== ""
        ? { targetDriverCode: aheadDriverCode }
        : {};

    entries.push({
      atMs,
      event: makeEvent(sessionId, type, RaceEventPriority.Medium, atMs, {
        driverNumber,
        ...(inDrsWindow && aheadDriverNumber !== null
          ? { targetDriverNumber: aheadDriverNumber }
          : {}),
        key: `${type}:${driverNumber}:${atMs}`,
        params: {
          driverCode: codeOf.get(driverNumber) ?? "",
          gapSeconds: Number(gap.toFixed(3)),
          ...aheadParams,
          ...targetParams,
        },
      }),
    });
    bucket.set(driverNumber, entries);
  }

  pushLatestPerDriver(gapClosings, MAX_GAP_CLOSING_PER_DRIVER);
  pushLatestPerDriver(drsRangeEntries, MAX_DRS_RANGE_PER_DRIVER);

  // 컴파운드 전략 갈림. 피트 후 새 스틴트를 시작한 드라이버가 같은 랩 기준으로
  // 필드 과반과 다른 컴파운드를 골랐을 때만 발행한다.
  // 출발 스틴트(lap_start <= 1)는 그리드 선택이라 "갈림"으로 보지 않는다.
  const strategyNotes = new Map<number, TimedRaceEvent[]>();
  const lapStartMsByDriverLap = new Map<string, number>();

  for (const { lap, atMs } of timedLaps) {
    lapStartMsByDriverLap.set(`${lap.driver_number}:${lap.lap_number}`, atMs);
  }

  // 해당 랩 시점에 나머지 드라이버가 쓰고 있던 컴파운드 분포를 센다.
  const countFieldCompounds = (
    lap: number,
    exceptDriverNumber: number,
  ): Map<string, number> => {
    const counts = new Map<string, number>();

    for (const driver of data.drivers) {
      if (driver.driver_number === exceptDriverNumber) {
        continue;
      }

      const compound = stintCompoundAtLap(data, driver.driver_number, lap);

      if (compound === null) {
        continue;
      }

      counts.set(compound, (counts.get(compound) ?? 0) + 1);
    }

    return counts;
  };

  const sortedStints = [...data.stints].sort(
    (a, b) => a.lap_start - b.lap_start,
  );

  for (const stint of sortedStints) {
    if (stint.lap_start <= 1) {
      continue;
    }

    const atMs = lapStartMsByDriverLap.get(
      `${stint.driver_number}:${stint.lap_start}`,
    );

    if (atMs === undefined || !withinWindow(atMs)) {
      continue;
    }

    const counts = countFieldCompounds(stint.lap_start, stint.driver_number);
    let fieldCompound: string | null = null;
    let fieldCount = 0;
    let total = 0;

    for (const [compound, count] of counts) {
      total += count;

      if (count > fieldCount) {
        fieldCompound = compound;
        fieldCount = count;
      }
    }

    // 표본이 적거나 과반이 없으면 "필드 다수"라고 말할 수 없다.
    if (
      fieldCompound === null ||
      total < MIN_STRATEGY_FIELD_SAMPLE ||
      fieldCount * 2 <= total ||
      fieldCompound === stint.compound
    ) {
      continue;
    }

    const entries = strategyNotes.get(stint.driver_number) ?? [];

    entries.push({
      atMs,
      event: makeEvent(
        sessionId,
        RaceEventType.StrategyNote,
        RaceEventPriority.Medium,
        atMs,
        {
          driverNumber: stint.driver_number,
          lapNumber: stint.lap_start,
          key: `strategy_note:${stint.driver_number}:${stint.lap_start}`,
          params: {
            driverCode: codeOf.get(stint.driver_number) ?? "",
            compound: stint.compound,
            fieldCompound,
          },
        },
      ),
    });
    strategyNotes.set(stint.driver_number, entries);
  }

  pushLatestPerDriver(strategyNotes, MAX_STRATEGY_NOTE_PER_DRIVER);

  // 리타이어 확정 (session_result). 세션 진행 중에는 없으므로 건너뛴다.
  const lastLapMsByDriver = new Map<number, number>();

  for (const { lap, atMs } of timedLaps) {
    lastLapMsByDriver.set(lap.driver_number, atMs);
  }

  for (const result of data.sessionResults ?? []) {
    const reason = result.dsq
      ? RetirementReason.Dsq
      : result.dns
        ? RetirementReason.Dns
        : result.dnf
          ? RetirementReason.Dnf
          : null;

    if (reason === null) {
      continue;
    }

    // session_result 에는 시각이 없다. 마지막 랩 시각, 없으면 창의 끝으로 둔다.
    const atMs = lastLapMsByDriver.get(result.driver_number) ?? endMs;

    push(
      atMs,
      makeEvent(sessionId, RaceEventType.Retirement, RaceEventPriority.High, atMs, {
        driverNumber: result.driver_number,
        key: `retirement:${result.driver_number}`,
        params: {
          driverCode: codeOf.get(result.driver_number) ?? "",
          reason,
          position: result.position,
          lapsCompleted: result.number_of_laps,
        },
      }),
    );
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
