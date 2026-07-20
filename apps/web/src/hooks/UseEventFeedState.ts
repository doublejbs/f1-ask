"use client";

import { EventFeedFilterMode } from "@/lib/EventFeedFilterMode";
import { RaceEvent, RaceEventPriority } from "@f1/domain";
import { useCallback, useMemo, useState } from "react";

// 기본 피드에 노출하는 우선순위 (docs/10-race-events.md §피드와 AI 컨텍스트 분리).
// Low / Medium 은 저장·AI 컨텍스트에는 쓰이지만 기본 피드에서는 감춘다.
const PRIMARY_PRIORITIES: RaceEventPriority[] = [
  RaceEventPriority.Critical,
  RaceEventPriority.High,
];

const isPrimary = (event: RaceEvent): boolean =>
  PRIMARY_PRIORITIES.includes(event.priority);

export type EventFeedState = {
  mode: EventFeedFilterMode;
  // 최신순으로 정렬된, 화면에 실제로 그릴 이벤트.
  visibleEvents: RaceEvent[];
  // "전체 보기"로 전환하면 더 보이게 될 이벤트 수.
  hiddenCount: number;
  handleChangeMode: (mode: EventFeedFilterMode) => void;
};

export const useEventFeedState = (
  events: RaceEvent[],
  maxEvents: number,
): EventFeedState => {
  const [mode, setMode] = useState<EventFeedFilterMode>(
    EventFeedFilterMode.Primary,
  );

  const handleChangeMode = useCallback((next: EventFeedFilterMode) => {
    setMode(next);
  }, []);

  const { visibleEvents, hiddenCount } = useMemo(() => {
    if (mode === EventFeedFilterMode.All) {
      return {
        visibleEvents: events.slice(-maxEvents).reverse(),
        hiddenCount: 0,
      };
    }

    // "전체 보기"로 바꿔도 결국 최근 maxEvents 건만 그린다. 따라서 세션 전체가 아니라
    // 동일한 slice 창(전체 기준 최근 maxEvents 건) 안에서 감춰진 개수를 센다.
    const allWindow = events.slice(-maxEvents);
    const hiddenInWindow = allWindow.filter(
      (event) => !isPrimary(event),
    ).length;

    return {
      visibleEvents: events.filter(isPrimary).slice(-maxEvents).reverse(),
      hiddenCount: hiddenInWindow,
    };
  }, [events, mode, maxEvents]);

  return { mode, visibleEvents, hiddenCount, handleChangeMode };
};
