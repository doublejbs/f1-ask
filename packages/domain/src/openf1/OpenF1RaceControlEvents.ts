import { RaceEventParams } from "../RaceEvent";
import { RaceEventPriority } from "../RaceEventPriority";
import { RaceEventType } from "../RaceEventType";
import { TrackHazardKind } from "../TrackHazardKind";
import {
  makeEvent,
  RaceEventParts,
  TimedRaceEvent,
} from "./OpenF1EventFactory";
import { OpenF1RaceControlCategory } from "./OpenF1RaceControlCategory";
import { OpenF1RaceControlFlag } from "./OpenF1RaceControlFlag";
import {
  parseIncidentCars,
  parseIncidentReason,
  parseInvestigationStatus,
  parsePenaltySeconds,
  parseRaceControlCategory,
  parseRaceControlFlag,
  parseRaceControlScope,
  parseRainPercent,
  parseTurnNumber,
} from "./OpenF1RaceControlParsing";
import { OpenF1RaceControlScope } from "./OpenF1RaceControlScope";
import { OpenF1RaceControl } from "./OpenF1Types";

// 상태 전이 중복 제거용 키. 같은 키에 같은 값이 연속으로 들어오면 발행하지 않는다.
const TRACK_STATE_KEY = "track";
const SESSION_STATE_KEY = "session";
const OVERTAKE_MODE_STATE_KEY = "overtake_mode";
const PIT_LANE_STATE_KEY = "pit_lane";
const RAIN_STATE_KEY = "rain";
const SECTOR_STATE_PREFIX = "sector";
const BLUE_STATE_PREFIX = "blue";
const INCIDENT_STATE_PREFIX = "incident";
const HAZARD_STATE_PREFIX = "hazard";

const SESSION_STARTED_TEXT = "SESSION STARTED";
const SESSION_FINISHED_TEXT = "SESSION FINISHED";

type EmitInput = RaceEventParts & {
  stateKey: string;
  stateValue: string;
  type: RaceEventType;
  priority: RaceEventPriority;
  atMs: number;
};

const parseMs = (date: string | null): number =>
  date === null ? Number.NaN : Date.parse(date);

// race_control 메시지를 구조화 필드 기준으로 이벤트로 변환한다.
// category → flag → scope 순으로 분기하고, 문자열 파싱은 category=Other 에만 쓴다.
export const buildRaceControlEvents = (
  sessionId: string,
  messages: OpenF1RaceControl[],
  codeOf: Map<number, string>,
): TimedRaceEvent[] => {
  const results: TimedRaceEvent[] = [];
  const lastState = new Map<string, string>();

  const emit = (input: EmitInput): void => {
    if (lastState.get(input.stateKey) === input.stateValue) {
      return;
    }

    lastState.set(input.stateKey, input.stateValue);

    const parts: RaceEventParts = { params: input.params, key: input.key };

    if (input.driverNumber !== undefined) {
      parts.driverNumber = input.driverNumber;
    }

    if (input.lapNumber !== undefined) {
      parts.lapNumber = input.lapNumber;
    }

    results.push({
      atMs: input.atMs,
      event: makeEvent(
        sessionId,
        input.type,
        input.priority,
        input.atMs,
        parts,
      ),
    });
  };

  // 트랙 전체 클리어(GREEN / CLEAR+Track)가 오면 위험물 상태를 리셋한다.
  // 리셋하지 않으면 같은 코너에서 한참 뒤 재발생한 리커버리 차량이 영구히 억제된다.
  const resetHazardState = (): void => {
    for (const key of [...lastState.keys()]) {
      if (key.startsWith(`${HAZARD_STATE_PREFIX}:`)) {
        lastState.delete(key);
      }
    }
  };

  // sector 가 null 이면 어느 섹터인지 알 수 없다. 하나의 버킷으로 합치면
  // 서로 다른 섹터의 옐로가 서로를 억제하므로 dedup 대상에서 제외한다.
  const toSectorStateKey = (sector: number | null, atMs: number): string =>
    sector === null
      ? `${SECTOR_STATE_PREFIX}:unknown:${atMs}`
      : `${SECTOR_STATE_PREFIX}:${sector}`;

  // SessionStatus 메시지가 없는 세션(실측 151행 중 2행만 존재)을 위해
  // GREEN / CHEQUERED 로 세션 시작·종료를 보완할지 미리 판단한다.
  const hasSessionStatusText = (keyword: string): boolean =>
    messages.some(
      (message) =>
        parseRaceControlCategory(message.category) ===
          OpenF1RaceControlCategory.SessionStatus &&
        message.message.toUpperCase().includes(keyword),
    );

  const hasSessionStartedMessage = hasSessionStatusText(SESSION_STARTED_TEXT);
  const hasSessionFinishedMessage = hasSessionStatusText(SESSION_FINISHED_TEXT);

  for (const message of messages) {
    const atMs = parseMs(message.date);

    if (Number.isNaN(atMs)) {
      continue;
    }

    const category = parseRaceControlCategory(message.category);
    const flag = parseRaceControlFlag(message.flag);
    const scope = parseRaceControlScope(message.scope);
    const text = message.message.toUpperCase();
    const lapNumber = message.lap_number ?? undefined;

    if (category === OpenF1RaceControlCategory.SessionStatus) {
      if (text.includes(SESSION_STARTED_TEXT)) {
        emit({
          stateKey: SESSION_STATE_KEY,
          stateValue: RaceEventType.SessionStarted,
          type: RaceEventType.SessionStarted,
          priority: RaceEventPriority.Medium,
          atMs,
          key: "start",
          params: {},
        });
      } else if (text.includes(SESSION_FINISHED_TEXT)) {
        emit({
          stateKey: SESSION_STATE_KEY,
          stateValue: RaceEventType.SessionFinished,
          type: RaceEventType.SessionFinished,
          priority: RaceEventPriority.High,
          atMs,
          key: "finish",
          params: {},
        });
      }

      continue;
    }

    if (category === OpenF1RaceControlCategory.SafetyCar) {
      const virtual = text.includes("VIRTUAL") || text.includes("VSC");

      if (virtual && text.includes("DEPLOYED")) {
        emit({
          stateKey: TRACK_STATE_KEY,
          stateValue: RaceEventType.VirtualSafetyCar,
          type: RaceEventType.VirtualSafetyCar,
          priority: RaceEventPriority.Critical,
          atMs,
          key: `vsc:${atMs}`,
          params: {},
        });
      } else if (!virtual && text.includes("DEPLOYED")) {
        emit({
          stateKey: TRACK_STATE_KEY,
          stateValue: RaceEventType.SafetyCar,
          type: RaceEventType.SafetyCar,
          priority: RaceEventPriority.Critical,
          atMs,
          key: `sc:${atMs}`,
          params: {},
        });
      } else if (text.includes("IN THIS LAP") || text.includes("ENDING")) {
        emit({
          stateKey: TRACK_STATE_KEY,
          stateValue: RaceEventType.SessionRestarted,
          type: RaceEventType.SessionRestarted,
          priority: RaceEventPriority.High,
          atMs,
          key: `restart:${atMs}`,
          params: {},
        });
      }

      continue;
    }

    if (category === OpenF1RaceControlCategory.Other) {
      emitOtherCategoryEvent(emit, text, atMs, lapNumber);

      continue;
    }

    if (
      flag === OpenF1RaceControlFlag.Clear &&
      scope === OpenF1RaceControlScope.Track
    ) {
      resetHazardState();

      continue;
    }

    if (flag === OpenF1RaceControlFlag.Red) {
      emit({
        stateKey: TRACK_STATE_KEY,
        stateValue: RaceEventType.RedFlag,
        type: RaceEventType.RedFlag,
        priority: RaceEventPriority.Critical,
        atMs,
        key: `red:${atMs}`,
        params: {},
      });

      continue;
    }

    if (flag === OpenF1RaceControlFlag.Chequered) {
      emit({
        stateKey: TRACK_STATE_KEY,
        stateValue: RaceEventType.ChequeredFlag,
        type: RaceEventType.ChequeredFlag,
        priority: RaceEventPriority.High,
        atMs,
        key: `chequered:${atMs}`,
        params: {},
      });

      if (!hasSessionFinishedMessage) {
        emit({
          stateKey: SESSION_STATE_KEY,
          stateValue: RaceEventType.SessionFinished,
          type: RaceEventType.SessionFinished,
          priority: RaceEventPriority.High,
          atMs,
          key: "finish",
          params: {},
        });
      }

      continue;
    }

    if (flag === OpenF1RaceControlFlag.Green) {
      resetHazardState();

      emit({
        stateKey: TRACK_STATE_KEY,
        stateValue: RaceEventType.GreenFlag,
        type: RaceEventType.GreenFlag,
        priority: RaceEventPriority.High,
        atMs,
        key: `green:${atMs}`,
        params: {},
      });

      if (!hasSessionStartedMessage) {
        emit({
          stateKey: SESSION_STATE_KEY,
          stateValue: RaceEventType.SessionStarted,
          type: RaceEventType.SessionStarted,
          priority: RaceEventPriority.Medium,
          atMs,
          key: "start",
          params: {},
        });
      }

      continue;
    }

    if (
      flag === OpenF1RaceControlFlag.Blue &&
      scope === OpenF1RaceControlScope.Driver
    ) {
      const driverNumber = message.driver_number ?? undefined;

      if (driverNumber === undefined) {
        continue;
      }

      emit({
        stateKey: `${BLUE_STATE_PREFIX}:${driverNumber}`,
        // 같은 랩에서 반복되는 블루 플래그는 접고, 다음 랩부터 다시 발행한다.
        stateValue: `${lapNumber ?? atMs}`,
        type: RaceEventType.BlueFlag,
        priority: RaceEventPriority.Low,
        atMs,
        driverNumber,
        ...(lapNumber === undefined ? {} : { lapNumber }),
        key: `blue:${driverNumber}:${atMs}`,
        params: { driverCode: codeOf.get(driverNumber) ?? "" },
      });

      continue;
    }

    const yellow =
      flag === OpenF1RaceControlFlag.Yellow ||
      flag === OpenF1RaceControlFlag.DoubleYellow;

    if (yellow && scope === OpenF1RaceControlScope.Sector) {
      const sector = message.sector ?? null;
      const double = flag === OpenF1RaceControlFlag.DoubleYellow;

      emit({
        stateKey: toSectorStateKey(sector, atMs),
        stateValue: `${RaceEventType.SectorYellow}:${double}`,
        type: RaceEventType.SectorYellow,
        priority: RaceEventPriority.Medium,
        atMs,
        ...(lapNumber === undefined ? {} : { lapNumber }),
        key: `sector_yellow:${sector}:${atMs}`,
        params: { sector, double },
      });

      continue;
    }

    if (yellow && scope === OpenF1RaceControlScope.Track) {
      emit({
        stateKey: TRACK_STATE_KEY,
        stateValue: RaceEventType.YellowFlag,
        type: RaceEventType.YellowFlag,
        priority: RaceEventPriority.High,
        atMs,
        key: `yellow:${atMs}`,
        params: {},
      });

      continue;
    }

    if (
      flag === OpenF1RaceControlFlag.Clear &&
      scope === OpenF1RaceControlScope.Sector
    ) {
      const sector = message.sector ?? null;

      emit({
        stateKey: toSectorStateKey(sector, atMs),
        stateValue: RaceEventType.SectorClear,
        type: RaceEventType.SectorClear,
        priority: RaceEventPriority.Low,
        atMs,
        ...(lapNumber === undefined ? {} : { lapNumber }),
        key: `sector_clear:${sector}:${atMs}`,
        params: { sector },
      });
    }
  }

  return results;
};

// category=Other 는 구조화 필드가 비어 있어 메시지 파싱이 유일한 수단이다.
// 파싱에 실패하면 이벤트를 발행하지 않는다(영어 원문을 params 에 담지 않는다).
const emitOtherCategoryEvent = (
  emit: (input: EmitInput) => void,
  text: string,
  atMs: number,
  lapNumber: number | undefined,
): void => {
  const lap = lapNumber === undefined ? {} : { lapNumber };

  const rainPercent = parseRainPercent(text);

  if (rainPercent !== null) {
    emit({
      stateKey: RAIN_STATE_KEY,
      stateValue: `${rainPercent}`,
      type: RaceEventType.RainRisk,
      priority: RaceEventPriority.Medium,
      atMs,
      ...lap,
      key: `rain:${atMs}`,
      params: { percent: rainPercent },
    });

    return;
  }

  const hazardKind = text.includes("RECOVERY VEHICLE")
    ? TrackHazardKind.RecoveryVehicle
    : text.includes("MARSHALS ON TRACK")
      ? TrackHazardKind.Marshals
      : null;

  if (hazardKind !== null) {
    const turn = parseTurnNumber(text);

    emit({
      stateKey: `${HAZARD_STATE_PREFIX}:${hazardKind}`,
      // 랩을 섞어 같은 코너라도 랩이 바뀌면 다시 발행한다.
      // (트랙 클리어 수신 시에는 resetHazardState 가 상태 자체를 지운다.)
      stateValue: `${turn}:${lapNumber ?? "unknown"}`,
      type: RaceEventType.TrackHazard,
      priority: RaceEventPriority.High,
      atMs,
      ...lap,
      key: `${HAZARD_STATE_PREFIX}:${hazardKind}:${atMs}`,
      params: { kind: hazardKind, turn },
    });

    return;
  }

  if (text.includes("OVERTAKE ENABLED") || text.includes("OVERTAKE DISABLED")) {
    const enabled = text.includes("OVERTAKE ENABLED");
    const type = enabled ? RaceEventType.OvertakeModeEnabled : RaceEventType.OvertakeModeDisabled;

    emit({
      stateKey: OVERTAKE_MODE_STATE_KEY,
      stateValue: type,
      type,
      priority: RaceEventPriority.Medium,
      atMs,
      ...lap,
      key: `${type}:${atMs}`,
      params: {},
    });

    return;
  }

  if (text.includes("PIT EXIT CLOSED") || text.includes("PIT EXIT OPEN")) {
    const closed = text.includes("PIT EXIT CLOSED");
    const type = closed
      ? RaceEventType.PitLaneClosed
      : RaceEventType.PitLaneOpen;

    emit({
      stateKey: PIT_LANE_STATE_KEY,
      stateValue: type,
      type,
      priority: RaceEventPriority.Medium,
      atMs,
      ...lap,
      key: `${type}:${atMs}`,
      params: {},
    });

    return;
  }

  const cars = parseIncidentCars(text);
  const first = cars[0];

  // 아래 분기는 모두 대상 차량을 특정해야 의미가 있다.
  if (first === undefined) {
    return;
  }

  const driverCodes = cars.map((car) => car.driverCode).join(",");
  const reason = parseIncidentReason(text);
  const turn = parseTurnNumber(text);
  const reasonParams: RaceEventParams = reason === null ? {} : { reason };
  const turnParams: RaceEventParams = turn === null ? {} : { turn };

  if (text.includes("PENALTY")) {
    const penaltySeconds = parsePenaltySeconds(text);

    emit({
      stateKey: `${INCIDENT_STATE_PREFIX}:penalty:${driverCodes}`,
      stateValue: `${reason}:${penaltySeconds}`,
      type: RaceEventType.Penalty,
      priority: RaceEventPriority.Critical,
      atMs,
      driverNumber: first.driverNumber,
      ...lap,
      key: `penalty:${driverCodes}:${atMs}`,
      params: {
        driverCode: first.driverCode,
        // 다중 차량 페널티에서 두 번째 이후 차량이 UI 에서 누락되지 않도록 전체를 담는다.
        driverCodes,
        penaltySeconds,
        ...reasonParams,
      },
    });

    return;
  }

  if (text.includes("TRACK LIMITS")) {
    emit({
      stateKey: `${INCIDENT_STATE_PREFIX}:track_limits:${driverCodes}`,
      stateValue: `${turn}:${atMs}`,
      type: RaceEventType.TrackLimits,
      priority: RaceEventPriority.Low,
      atMs,
      driverNumber: first.driverNumber,
      ...lap,
      key: `track_limits:${driverCodes}:${atMs}`,
      params: { driverCode: first.driverCode, turn },
    });

    return;
  }

  const status = parseInvestigationStatus(text);

  if (status !== null) {
    emit({
      stateKey: `${INCIDENT_STATE_PREFIX}:investigation:${driverCodes}`,
      stateValue: `${reason}:${status}`,
      type: RaceEventType.Investigation,
      priority: RaceEventPriority.High,
      atMs,
      driverNumber: first.driverNumber,
      ...lap,
      key: `investigation:${driverCodes}:${atMs}`,
      params: {
        driverCodes,
        status,
        ...reasonParams,
        ...turnParams,
      },
    });
  }
};
