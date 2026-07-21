import { RaceEvent } from "./RaceEvent";
import { RaceEventPriority } from "./RaceEventPriority";

// 고정 이벤트 스택이 다루는 우선순위 (docs/14-event-placement.md
// "최신 이벤트 카드 — Critical + High").
const STACK_PRIORITIES: readonly RaceEventPriority[] = [
  RaceEventPriority.Critical,
  RaceEventPriority.High,
];

// 고정 영역이 넘겨보는 최대 건수. 한 번에 1건만 그리므로 건수는 더 이상 높이를
// 잠식하지 않고, 사용자가 위/아래로 되짚어볼 수 있는 이력의 깊이만 정한다.
//
// 10건인 이유: 스냅샷은 6초마다 갱신되고 Critical/High 는 통상 분당 1~3건 수준이라
// 10건이면 대략 최근 몇 분을 덮는다. 이보다 얕으면 사용자가 보던 이벤트가 금세
// 창 밖으로 밀려 커서가 최신으로 되돌아가고, 더 깊으면 이미 순위 행 마커와
// 드라이버 상세 시트가 담당하는 "이력" 영역과 역할이 겹친다.
export const LATEST_PRIORITY_EVENT_LIMIT = 10;

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
