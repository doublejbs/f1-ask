import { RaceEvent } from "../RaceEvent";

// baseEvents 와 overridingEvents 를 deduplicationKey 기준으로 병합한다.
//
// 왜 필요한가: 추월 예측 같은 엣지 트리거 이벤트는 발화한 그 폴링 프레임에만 실리고
// 마지막 프레임 events 에는 없다. 해설을 폴링 창 종료 후 마지막 프레임만으로 만들면
// 창 중간에 발화한 예측이 통째로 빠지므로, 창 내 누적분을 마지막 프레임과 병합해야
// 한다. overridingEvents 가 나중(우선순위 높음)이므로, 같은 키가 겹치면
// overridingEvents 의 이벤트가 이긴다.
export const mergeEventsByDeduplicationKey = (
  baseEvents: RaceEvent[],
  overridingEvents: RaceEvent[],
): RaceEvent[] => {
  const mergedByKey = new Map<string, RaceEvent>();

  for (const event of baseEvents) {
    mergedByKey.set(event.deduplicationKey, event);
  }

  for (const event of overridingEvents) {
    mergedByKey.set(event.deduplicationKey, event);
  }

  return [...mergedByKey.values()];
};
