import { RaceEvent, RaceEventParams } from "./RaceEvent";
import { RaceEventType } from "./RaceEventType";
import { SessionStateSeverity } from "./SessionStateSeverity";

// 현재 활성인 세션 상태 하나 (docs/14-event-placement.md "세션 상태 → 상단 스트립").
export type ActiveSessionState = {
  type: RaceEventType;
  // 섹터 옐로만 값을 가진다. 섹터를 모르는 트랙 전체 옐로는 null 이다.
  sector: number | null;
  severity: SessionStateSeverity;
  // 상태를 연 이벤트의 params 를 그대로 넘긴다(UI 가 로케일별로 번역한다).
  params: RaceEventParams;
  // 상태가 열린 시각(ISO). "SC 전개 후 경과" 같은 표시에 쓴다.
  sinceTimestamp: string;
};

// 심각도 정렬 가중치. 값이 작을수록 위에 온다(적기 > SC/VSC > 옐로 > 정보성).
const SEVERITY_ORDER: Record<SessionStateSeverity, number> = {
  [SessionStateSeverity.Critical]: 0,
  [SessionStateSeverity.High]: 1,
  [SessionStateSeverity.Caution]: 2,
  [SessionStateSeverity.Info]: 3,
};

// 그린 플래그가 해제하는 트랙 상태들.
// 섹터 옐로는 포함하지 않는다 — 스펙상 같은 섹터의 SectorClear 로만 해제된다.
const GREEN_FLAG_CLEARED_TYPES: readonly RaceEventType[] = [
  RaceEventType.SafetyCar,
  RaceEventType.VirtualSafetyCar,
  RaceEventType.RedFlag,
  RaceEventType.YellowFlag,
  RaceEventType.TrackHazard,
];

// 세션을 종료시키는 이벤트. 다른 모든 활성 상태를 비우고 자신만 남는다.
const TERMINAL_TYPES: readonly RaceEventType[] = [
  RaceEventType.SessionFinished,
  RaceEventType.ChequeredFlag,
];

// RainRisk 는 해제 이벤트가 없어 항상 같은 키를 덮어써 최신 값만 유지한다.
const RAIN_RISK_KEY = "rain_risk";

// params 에서 숫자만 꺼낸다. 문자열·불리언·null 은 섹터 번호로 쓸 수 없다.
const readParamNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

// params 에서 비어 있지 않은 문자열만 꺼낸다.
const readParamString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? null : trimmed;
};

// 상태별 심각도. 지속 상태가 아닌 타입은 정보성으로 떨어뜨린다.
export const getSessionStateSeverity = (
  type: RaceEventType,
): SessionStateSeverity => {
  if (type === RaceEventType.RedFlag) {
    return SessionStateSeverity.Critical;
  }

  if (
    type === RaceEventType.SafetyCar ||
    type === RaceEventType.VirtualSafetyCar
  ) {
    return SessionStateSeverity.High;
  }

  if (
    type === RaceEventType.YellowFlag ||
    type === RaceEventType.SectorYellow ||
    type === RaceEventType.TrackHazard
  ) {
    return SessionStateSeverity.Caution;
  }

  return SessionStateSeverity.Info;
};

// 상태 저장 키. 섹터 옐로는 섹터별로, 트랙 위험물은 종류별로 독립 상태다.
const toStateKey = (type: RaceEventType, params: RaceEventParams): string => {
  if (type === RaceEventType.SectorYellow) {
    return `${RaceEventType.SectorYellow}:${readParamNumber(params.sector) ?? "unknown"}`;
  }

  if (type === RaceEventType.TrackHazard) {
    return `${RaceEventType.TrackHazard}:${readParamString(params.kind) ?? "unknown"}`;
  }

  if (type === RaceEventType.RainRisk) {
    return RAIN_RISK_KEY;
  }

  return type;
};

// 이벤트 timestamp 를 밀리초로 바꾼다. 파싱 불가면 null (예외를 던지지 않는다).
const readTimestampMs = (timestamp: string): number | null => {
  const ms = Date.parse(timestamp);

  return Number.isNaN(ms) ? null : ms;
};

// 조건에 맞는 활성 상태를 지운다. Map 은 순회 중 delete 가 안전하다.
const clearStates = (
  states: Map<string, ActiveSessionState>,
  shouldClear: (state: ActiveSessionState) => boolean,
): void => {
  for (const [key, state] of states) {
    if (shouldClear(state)) {
      states.delete(key);
    }
  }
};

// 열림 이벤트를 활성 상태로 기록한다. 같은 키가 이미 있으면 최신 값으로 교체한다.
const openState = (
  states: Map<string, ActiveSessionState>,
  event: RaceEvent,
): void => {
  const key = toStateKey(event.type, event.params);

  states.set(key, {
    type: event.type,
    sector:
      event.type === RaceEventType.SectorYellow
        ? readParamNumber(event.params.sector)
        : null,
    severity: getSessionStateSeverity(event.type),
    params: event.params,
    sinceTimestamp: event.timestamp,
  });
};

// 닫힘 이벤트를 처리한다. 상태를 여는 타입이면 false 를 돌려 호출부가 열도록 한다.
const applyClosingEvent = (
  states: Map<string, ActiveSessionState>,
  event: RaceEvent,
): boolean => {
  // 세션 재시작 — 트랙이 완전히 초기화된다. 섹터 옐로까지 모두 지운다.
  if (event.type === RaceEventType.SessionRestarted) {
    clearStates(
      states,
      (state) =>
        GREEN_FLAG_CLEARED_TYPES.includes(state.type) ||
        state.type === RaceEventType.SectorYellow,
    );

    return true;
  }

  // 그린 플래그 — 트랙 전체 상태만 해제한다(섹터 옐로는 SectorClear 담당).
  if (event.type === RaceEventType.GreenFlag) {
    clearStates(states, (state) =>
      GREEN_FLAG_CLEARED_TYPES.includes(state.type),
    );

    return true;
  }

  // 섹터 클리어 — 같은 섹터의 옐로만 지운다.
  // 섹터가 없는(트랙 전체) 클리어는 모든 섹터 옐로와 트랙 위험물을 지운다.
  if (event.type === RaceEventType.SectorClear) {
    const sector = readParamNumber(event.params.sector);

    if (sector === null) {
      clearStates(
        states,
        (state) =>
          state.type === RaceEventType.SectorYellow ||
          state.type === RaceEventType.TrackHazard,
      );

      return true;
    }

    clearStates(
      states,
      (state) =>
        state.type === RaceEventType.SectorYellow && state.sector === sector,
    );

    return true;
  }

  if (event.type === RaceEventType.PitLaneOpen) {
    clearStates(states, (state) => state.type === RaceEventType.PitLaneClosed);

    return true;
  }

  if (event.type === RaceEventType.OvertakeModeEnabled) {
    clearStates(
      states,
      (state) => state.type === RaceEventType.OvertakeModeDisabled,
    );

    return true;
  }

  // 세션 시작 — 이전 세션의 잔여 상태를 비운다. 자신은 지속 상태가 아니다.
  if (event.type === RaceEventType.SessionStarted) {
    states.clear();

    return true;
  }

  return false;
};

// 상태를 여는(지속되는) 세션 이벤트인지 본다.
const isOpeningType = (type: RaceEventType): boolean =>
  type === RaceEventType.SafetyCar ||
  type === RaceEventType.VirtualSafetyCar ||
  type === RaceEventType.RedFlag ||
  type === RaceEventType.YellowFlag ||
  type === RaceEventType.SectorYellow ||
  type === RaceEventType.TrackHazard ||
  type === RaceEventType.PitLaneClosed ||
  type === RaceEventType.OvertakeModeDisabled ||
  type === RaceEventType.RainRisk;

// 세션 이벤트의 열림/닫힘 쌍을 접어 현재 활성 상태 집합을 만든다.
// 순수 함수이며 예외를 던지지 않는다.
//
// - 이벤트 순서는 보장되지 않으므로 내부에서 timestamp 오름차순으로 정렬한 뒤 접는다.
// - `atMs` 를 주면 그 시각까지의 이벤트만 반영한다(경기 시계 기준 리플레이용).
// - 반환값은 심각도 → 최신순으로 정렬되어 있어 UI 가 그대로 나열하면 된다.
export const selectActiveSessionStates = (
  events: readonly RaceEvent[],
  atMs?: number,
): ActiveSessionState[] => {
  const ordered = events
    .map((event) => ({ event, ms: readTimestampMs(event.timestamp) }))
    .filter(
      (entry): entry is { event: RaceEvent; ms: number } => entry.ms !== null,
    )
    .filter((entry) => atMs === undefined || entry.ms <= atMs)
    .sort((a, b) => a.ms - b.ms);

  const states = new Map<string, ActiveSessionState>();

  for (const { event } of ordered) {
    // 종료 이벤트는 다른 모든 상태를 비우고 자신만 남긴다.
    if (TERMINAL_TYPES.includes(event.type)) {
      states.clear();
      openState(states, event);

      continue;
    }

    if (applyClosingEvent(states, event)) {
      continue;
    }

    if (isOpeningType(event.type)) {
      openState(states, event);
    }
  }

  return [...states.values()].sort((a, b) => {
    const severityDiff =
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];

    if (severityDiff !== 0) {
      return severityDiff;
    }

    // 같은 심각도면 최근에 열린 상태가 위로 온다.
    return b.sinceTimestamp.localeCompare(a.sinceTimestamp);
  });
};
