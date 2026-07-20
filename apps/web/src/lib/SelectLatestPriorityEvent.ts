import { RaceEvent, RaceEventPriority } from "@f1/domain";

// 최신 이벤트 카드가 다루는 우선순위 (docs/14-event-placement.md
// "최신 이벤트 카드 — Critical + High 중 가장 최근 1건").
const CARD_PRIORITIES: readonly RaceEventPriority[] = [
  RaceEventPriority.Critical,
  RaceEventPriority.High,
];

// Critical/High 중 `atMs` 기준 가장 최근 1건을 고른다. 없으면 null.
//
// `atMs` 는 벽시계가 아니라 **경기 시계**(스냅샷의 sourceUpdatedAt)를 받는다.
// 리플레이는 과거 타임스탬프를 쓰므로 벽시계로 판정하면 미래 이벤트가 새어 든다.
//
// 순수 함수 — 시간 소스를 인자로 주입받고 예외를 던지지 않는다.
export const selectLatestPriorityEvent = (
  events: readonly RaceEvent[],
  atMs: number,
): RaceEvent | null => {
  let latest: RaceEvent | null = null;
  let latestMs = -Infinity;

  for (const event of events) {
    if (!CARD_PRIORITIES.includes(event.priority)) {
      continue;
    }

    const eventMs = Date.parse(event.timestamp);

    if (Number.isNaN(eventMs)) {
      continue;
    }

    // 아직 일어나지 않은 이벤트는 보여주지 않는다.
    if (Number.isFinite(atMs) && eventMs > atMs) {
      continue;
    }

    if (eventMs > latestMs) {
      latest = event;
      latestMs = eventMs;
    }
  }

  return latest;
};
