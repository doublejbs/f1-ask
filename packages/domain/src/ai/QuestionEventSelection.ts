import { RaceEvent } from "../RaceEvent";
import { RaceEventPriority } from "../RaceEventPriority";
import { isQuestionContextEligibleType } from "./QuestionEventAllowlist";

// AI 질문 컨텍스트에 싣는 이벤트 상한.
//
// 왜 8 이 아니라 40 인가: 이전에는 `recentEvents.slice(-8)` 로 **시간순 최신 8건**만
// 실었다. 벨기에 GP 실측에서 후반에 쏟아지는 override_range_entered·gap_closing·
// personal_best_lap 같은 고빈도 저의미 타입이 그 8칸을 다 차지해, pit_stop·penalty·
// investigation 이 창 밖으로 밀렸다(사용자가 "피트인이 왜 없냐" 고 물은 증상).
//
// 타입 allowlist 로 소음을 먼저 걷어내면 벨기에 GP 기준 대상이 ~69건이라 8칸은 너무 좁다.
// 40 이면 실측 대상을 거의 다 담으면서도 토큰이 과하지 않다. 대상이 40 을 넘으면 우선순위
// 순(critical → high → medium → low)으로 채우고, 같은 우선순위 안에서는 최신을 남긴다.
export const RECENT_QUESTION_EVENT_LIMIT = 40;

// 우선순위 정렬용 순위. 높을수록 먼저 채운다.
const PRIORITY_RANK: Record<RaceEventPriority, number> = {
  [RaceEventPriority.Critical]: 3,
  [RaceEventPriority.High]: 2,
  [RaceEventPriority.Medium]: 1,
  [RaceEventPriority.Low]: 0,
};

// 정렬용 후보. 타임스탬프가 같을 때 입력 순서로 안정적으로 가르기 위해 index 를 든다.
type EventCandidate = {
  event: RaceEvent;
  eventMs: number;
  index: number;
};

// 파싱 불가 timestamp 는 가장 오래된 것으로 취급해 우선 밀려나게 한다.
const toEventMs = (timestamp: string): number => {
  const ms = Date.parse(timestamp);

  if (Number.isNaN(ms)) {
    return Number.NEGATIVE_INFINITY;
  }

  return ms;
};

// 질문 컨텍스트에 실을 이벤트를 선별한다 — 도메인 순수 함수.
//
// **세 provider(Claude·Gemini·OpenAI)가 이 함수 하나를 호출한다.** 각자 `slice(-8)` 을
// 두면 8 을 40 으로 바꿔도 우선순위가 없어 추월·갭이 그대로 창을 밀어낸다(스펙 A). 선별을
// 한 곳에 두어야 세 provider 의 컨텍스트가 갈라지지 않는다.
//
// 순서:
//   1. 타입 allowlist 로 소음(추월·갭·오버라이드 등)을 먼저 제거한다.
//   2. 우선순위 → 최신순으로 정렬해 상한 안에 드는 상위 `limit` 건을 고른다.
//   3. 고른 것을 다시 시간 오름차순으로 되돌려 준다 — 프롬프트가 타임라인으로 읽히도록.
export const selectQuestionEvents = (
  events: readonly RaceEvent[],
  limit: number = RECENT_QUESTION_EVENT_LIMIT,
): RaceEvent[] => {
  if (limit <= 0) {
    return [];
  }

  const candidates: EventCandidate[] = [];

  events.forEach((event, index) => {
    if (!isQuestionContextEligibleType(event.type)) {
      return;
    }

    candidates.push({ event, eventMs: toEventMs(event.timestamp), index });
  });

  // 우선순위 내림차순, 같으면 최신순, 그래도 같으면 나중에 들어온 것을 위로.
  candidates.sort((left, right) => {
    const priorityDiff =
      PRIORITY_RANK[right.event.priority] - PRIORITY_RANK[left.event.priority];

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    if (left.eventMs !== right.eventMs) {
      return right.eventMs - left.eventMs;
    }

    return right.index - left.index;
  });

  const picked = candidates.slice(0, limit);

  // 프롬프트에는 시간 오름차순으로 넣는다. 선별은 우선순위로 했지만, 읽을 때는
  // 경기가 흐른 순서여야 맥락이 자연스럽다.
  picked.sort((left, right) => {
    if (left.eventMs !== right.eventMs) {
      return left.eventMs - right.eventMs;
    }

    return left.index - right.index;
  });

  return picked.map((candidate) => candidate.event);
};
