import { RaceEvent } from "./RaceEvent";
import { RaceEventPriority } from "./RaceEventPriority";

// 기본 피드에 노출하는 우선순위 (docs/10-race-events.md §피드와 AI 컨텍스트 분리).
// Low / Medium 은 저장·AI 컨텍스트에는 쓰이지만 기본 피드에서는 감춘다.
// 구독 쿼리 필터와 화면의 "감춰진 건수" 계산이 같은 정의를 쓰도록 여기 한 곳에 둔다.
export const PRIMARY_EVENT_PRIORITIES: RaceEventPriority[] = [
  RaceEventPriority.Critical,
  RaceEventPriority.High,
];

export const isPrimaryRaceEvent = (event: RaceEvent): boolean =>
  PRIMARY_EVENT_PRIORITIES.includes(event.priority);
