import { RaceEvent } from "./RaceEvent";
import { RaceEventType } from "./RaceEventType";

// 순간 이벤트 아이콘이 행에 머무는 기본 시간(ms).
// 팀 라디오 인디케이터(2분)보다 훨씬 짧게 잡는다 — 추월·피트스톱은 "방금 일어난 일"을
// 알리는 신호이고, 길게 남으면 행이 계속 아이콘으로 덮여 순위 읽기를 방해한다.
export const DEFAULT_RECENT_DRIVER_EVENT_WINDOW_MS = 30_000;

// 행에 일시 표시할 드라이버 순간 이벤트 (docs/14-event-placement.md "드라이버 순간 이벤트").
//
// 제외 대상:
//   - `TeamRadioPosted` — 라디오 인디케이터가 이미 행에 있다.
//   - `GapClosing` / `OverrideRangeEntered` — 배틀 인라인 표현이 이미 있다.
//   - `PositionChange` / `GapIncreasing` — 등락 표시와 갭 컬럼이 이미 담당한다.
//   - `Retirement` — 지속 상태이며 `retired` 플래그로 표현한다.
export const RECENT_DRIVER_EVENT_TYPES: readonly RaceEventType[] = [
  RaceEventType.Overtake,
  RaceEventType.PitStop,
  RaceEventType.FastestLap,
  RaceEventType.PersonalBestLap,
  RaceEventType.TrackLimits,
  RaceEventType.StrategyNote,
  RaceEventType.BlueFlag,
];

// 이벤트 timestamp 를 밀리초로 바꾼다. 파싱 불가면 null.
const readTimestampMs = (timestamp: string): number | null => {
  const ms = Date.parse(timestamp);

  return Number.isNaN(ms) ? null : ms;
};

// 드라이버 번호별로 창 안의 가장 최근 순간 이벤트 1건을 고른다.
// 순수 함수이며 예외를 던지지 않는다.
//
// `atMs` 는 벽시계가 아니라 **경기 시계**(스냅샷의 `sourceUpdatedAt`)를 받는다.
// 벽시계로 판정하면 리플레이·목 데이터에서 모든 이벤트가 항상 창 밖이 된다.
export const selectRecentDriverEvents = (
  events: readonly RaceEvent[],
  atMs: number,
  windowMs: number = DEFAULT_RECENT_DRIVER_EVENT_WINDOW_MS,
): Map<number, RaceEvent> => {
  const recent = new Map<number, RaceEvent>();

  if (!Number.isFinite(atMs) || windowMs <= 0) {
    return recent;
  }

  const latestMsByDriver = new Map<number, number>();

  for (const event of events) {
    const driverNumber = event.driverNumber;

    if (driverNumber === undefined) {
      continue;
    }

    if (!RECENT_DRIVER_EVENT_TYPES.includes(event.type)) {
      continue;
    }

    const ms = readTimestampMs(event.timestamp);

    if (ms === null) {
      continue;
    }

    // 미래 이벤트는 아직 일어나지 않았고, 창을 벗어난 이벤트는 이미 사라졌다.
    if (ms > atMs || atMs - ms >= windowMs) {
      continue;
    }

    const latestMs = latestMsByDriver.get(driverNumber);

    if (latestMs !== undefined && latestMs >= ms) {
      continue;
    }

    latestMsByDriver.set(driverNumber, ms);
    recent.set(driverNumber, event);
  }

  return recent;
};
