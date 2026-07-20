"use client";

import { EventFeedFilterMode } from "@/lib/EventFeedFilterMode";
import { isPrimaryRaceEvent, RaceEvent } from "@f1/domain";
import { useCallback, useMemo, useState } from "react";

// 피드에 그리는 최대 이벤트 수. 데스크톱 피드와 모바일 이벤트 시트가 같은 창을 쓴다.
export const MAX_FEED_EVENTS = 12;

export type EventFeedState = {
  mode: EventFeedFilterMode;
  // 최신순으로 정렬된, 화면에 실제로 그릴 이벤트.
  visibleEvents: RaceEvent[];
  // "전체 보기"로 전환하면 새로 보이게 될 이벤트 수.
  hiddenCount: number;
  handleChangeMode: (mode: EventFeedFilterMode) => void;
};

// 이벤트 피드 상태.
// 두 배열은 데이터 계층(useLiveRace)에서 이미 우선순위별로 나뉘어 들어오므로
// 여기서 다시 필터링하지 않는다. 모드에 따라 어느 쪽을 그릴지만 고른다.
export const useEventFeedState = (
  primaryEvents: RaceEvent[],
  allEvents: RaceEvent[],
  maxEvents: number,
): EventFeedState => {
  const [mode, setMode] = useState<EventFeedFilterMode>(
    EventFeedFilterMode.Primary,
  );

  const handleChangeMode = useCallback((next: EventFeedFilterMode) => {
    setMode(next);
  }, []);

  const { visibleEvents, hiddenCount } = useMemo(() => {
    // "전체 보기"로 바꿔도 결국 최근 maxEvents 건만 그린다. 그 창 안에서
    // 주요 이벤트가 아닌 항목 수가 곧 "전환하면 새로 보이게 될 건수"다.
    const allWindow = allEvents.slice(-maxEvents);

    if (mode === EventFeedFilterMode.All) {
      return {
        visibleEvents: allWindow.slice().reverse(),
        hiddenCount: 0,
      };
    }

    return {
      visibleEvents: primaryEvents.slice(-maxEvents).reverse(),
      hiddenCount: allWindow.filter((event) => !isPrimaryRaceEvent(event))
        .length,
    };
  }, [primaryEvents, allEvents, mode, maxEvents]);

  return { mode, visibleEvents, hiddenCount, handleChangeMode };
};
