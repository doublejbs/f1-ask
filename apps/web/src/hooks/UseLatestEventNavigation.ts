"use client";

import {
  RaceEvent,
  resolveLatestEventCursorId,
  resolveLatestEventIndex,
} from "@f1/domain";
import { useCallback, useMemo, useState } from "react";

type LatestEventNavigation = {
  // 지금 보여줄 이벤트. 목록이 비었으면 null.
  currentEvent: RaceEvent | null;
  // 0-based 인덱스. 화면 표시("2/8")에는 +1 해서 쓴다.
  currentIndex: number;
  totalCount: number;
  canGoNewer: boolean;
  canGoOlder: boolean;
  // 위 버튼 — 더 최신 이벤트(인덱스 -1)로.
  handleGoNewer: () => void;
  // 아래 버튼 — 더 과거 이벤트(인덱스 +1)로.
  handleGoOlder: () => void;
};

// 고정 이벤트 영역의 "한 번에 1건" 커서를 관리한다.
//
// 커서는 인덱스가 아니라 **이벤트 id**(`resolveLatestEventIndex` 참고)로 들고 있다.
// 목록은 6초마다 앞에서 자라므로 인덱스로 들면 새 이벤트가 올 때마다 보던 항목이
// 아래로 밀려 화면이 튄다. id 로 들면 세 가지가 자동으로 성립한다:
//
//   1) 최신(커서 null)을 보는 중 → 새 이벤트가 오면 계속 최신을 따라간다
//   2) 과거를 보는 중 → 목록이 자라도 보던 이벤트를 유지한다
//   3) 보던 이벤트가 창 밖으로 밀려나면 → 최신으로 되돌아간다
//
// `events` 는 최신순으로 정렬돼 있다고 가정한다(selectLatestPriorityEvents 의 계약).
export const useLatestEventNavigation = (
  events: readonly RaceEvent[],
): LatestEventNavigation => {
  // null = "최신 따라가기". 사용자가 과거로 넘기면 그 이벤트 id 가 들어온다.
  const [cursorEventId, setCursorEventId] = useState<string | null>(null);

  const eventIds = useMemo(
    () => events.map((event) => event.id),
    [events],
  );

  const currentIndex = resolveLatestEventIndex(eventIds, cursorEventId);

  const totalCount = events.length;

  const currentEvent = events[currentIndex] ?? null;

  const canGoNewer = currentIndex > 0;

  const canGoOlder = currentIndex < totalCount - 1;

  const moveTo = useCallback(
    (targetIndex: number) => {
      setCursorEventId(resolveLatestEventCursorId(eventIds, targetIndex));
    },
    [eventIds],
  );

  const handleGoNewer = useCallback(() => {
    if (!canGoNewer) {
      return;
    }

    moveTo(currentIndex - 1);
  }, [canGoNewer, currentIndex, moveTo]);

  const handleGoOlder = useCallback(() => {
    if (!canGoOlder) {
      return;
    }

    moveTo(currentIndex + 1);
  }, [canGoOlder, currentIndex, moveTo]);

  return {
    currentEvent,
    currentIndex,
    totalCount,
    canGoNewer,
    canGoOlder,
    handleGoNewer,
    handleGoOlder,
  };
};
