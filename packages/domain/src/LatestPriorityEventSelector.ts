import { RaceEvent } from "./RaceEvent";
import { RaceEventPriority } from "./RaceEventPriority";

// 고정 이벤트 스택이 다루는 우선순위 (docs/14-event-placement.md
// "최신 이벤트 카드 — Critical + High").
const STACK_PRIORITIES: readonly RaceEventPriority[] = [
  RaceEventPriority.Critical,
  RaceEventPriority.High,
];

// 스택에 쌓는 최대 건수. 스택은 상단에 고정(sticky)되므로 건수가 늘면 그만큼
// 순위가 잠식된다. 고정 영역 높이 예산(뷰포트의 35%) 때문에 상한이 필요하다.
export const LATEST_PRIORITY_EVENT_LIMIT = 3;

// 정렬용 후보. 타임스탬프가 같을 때 입력 순서로 안정적으로 가르기 위해 index 를 든다.
type EventCandidate = {
  event: RaceEvent;
  eventMs: number;
  index: number;
};

// Critical/High 중 `atMs` 기준 최근 `limit` 건을 **최신순**으로 고른다.
// 조건에 맞는 이벤트가 없으면 빈 배열.
//
// `atMs` 는 벽시계가 아니라 **경기 시계**(스냅샷의 sourceUpdatedAt)를 받는다.
// 리플레이는 과거 타임스탬프를 쓰므로 벽시계로 판정하면 미래 이벤트가 새어 든다.
//
// 순수 함수 — 시간 소스를 인자로 주입받고 예외를 던지지 않는다.
export const selectLatestPriorityEvents = (
  events: readonly RaceEvent[],
  atMs: number,
  limit: number = LATEST_PRIORITY_EVENT_LIMIT,
): RaceEvent[] => {
  if (limit <= 0) {
    return [];
  }

  const candidates: EventCandidate[] = [];

  events.forEach((event, index) => {
    if (!STACK_PRIORITIES.includes(event.priority)) {
      return;
    }

    const eventMs = Date.parse(event.timestamp);

    if (Number.isNaN(eventMs)) {
      return;
    }

    // 아직 일어나지 않은 이벤트는 보여주지 않는다.
    if (Number.isFinite(atMs) && eventMs > atMs) {
      return;
    }

    candidates.push({ event, eventMs, index });
  });

  // 최신순. 동시각이면 나중에 들어온 이벤트를 위로 올린다.
  candidates.sort((left, right) => {
    if (left.eventMs !== right.eventMs) {
      return right.eventMs - left.eventMs;
    }

    return right.index - left.index;
  });

  return candidates.slice(0, limit).map((candidate) => candidate.event);
};
