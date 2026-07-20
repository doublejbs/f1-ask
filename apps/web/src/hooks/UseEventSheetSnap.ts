"use client";

import { EventSheetSnap } from "@/lib/EventSheetSnap";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

// 떠 있는 탭바(TabBarView)는 fixed bottom-0 z-40 이라 시트 하단과 겹친다.
// 375x812 뷰포트 실측값: nav 전체 높이 88.5px(알약 64.5px + pb-safe 24px).
// 접힘 높이는 "핸들 + 최신 1건" 위에 이 인셋을 더해야 탭바가 이벤트를 가리지 않는다.
export const TAB_BAR_INSET_PX = 88;

// 시트 고정 크롬(그랩 핸들 + 필터) 높이. 44pt 터치 타깃 한 줄.
const SHEET_CHROME_PX = 44;

// 최신 1건의 실측 높이를 아직 모를 때 쓰는 기본값(단행 이벤트 실측 45px + 여유).
const FALLBACK_EVENT_ROW_PX = 52;

// 접힘이 최신 1건에 내줄 수 있는 최대 높이. 해설이 붙은 긴 항목이 접힘을
// 기본 단계만큼 키워 "접힘"의 의미를 잃는 것을 막는다.
const MAX_COLLAPSED_ROW_PX = 132;

const DEFAULT_HEIGHT_RATIO = 0.45;

const EXPANDED_HEIGHT_RATIO = 0.85;

// 드래그로 인정할 최소 이동량. 이보다 작으면 탭(단계 순환)으로 처리한다.
const DRAG_TAP_THRESHOLD_PX = 6;

const SNAP_ORDER: EventSheetSnap[] = [
  EventSheetSnap.Collapsed,
  EventSheetSnap.Default,
  EventSheetSnap.Expanded,
];

export type EventSheetSnapController = {
  snap: EventSheetSnap;
  // 시트 요소에 연결한다. 드래그 시작 시 현재 높이를 재는 데 쓴다.
  sheetRef: RefObject<HTMLElement | null>;
  // 시트에 적용할 height. 드래그 중에는 px, 아니면 단계별 CSS 길이다.
  heightStyle: string;
  isDragging: boolean;
  handleToggleSnap: () => void;
  handlePointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  handlePointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  handlePointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
};

// 접힘 높이 = 고정 크롬 + 최신 1건 + 탭바 인셋.
// 1건의 높이는 실측값을 쓴다 — 여러 줄로 접히는 이벤트(인시던트 문장·해설)를
// 상수로 가정하면 접힘에서 최신 1건이 잘려 스펙을 어긴다.
const getCollapsedHeightPx = (firstRowHeightPx: number | null): number => {
  const rowHeight = Math.min(
    firstRowHeightPx ?? FALLBACK_EVENT_ROW_PX,
    MAX_COLLAPSED_ROW_PX,
  );

  return SHEET_CHROME_PX + rowHeight + TAB_BAR_INSET_PX;
};

// 단계별 실제 높이(px). 가장 가까운 스냅을 고를 때 쓴다.
const getSnapHeightPx = (
  snap: EventSheetSnap,
  viewportHeight: number,
  collapsedHeightPx: number,
): number => {
  if (snap === EventSheetSnap.Collapsed) {
    return collapsedHeightPx;
  }

  if (snap === EventSheetSnap.Expanded) {
    return viewportHeight * EXPANDED_HEIGHT_RATIO;
  }

  return viewportHeight * DEFAULT_HEIGHT_RATIO;
};

// 놓은 높이에서 가장 가까운 스냅 단계를 고른다.
const findNearestSnap = (
  heightPx: number,
  viewportHeight: number,
  collapsedHeightPx: number,
): EventSheetSnap => {
  let nearest = EventSheetSnap.Default;
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of SNAP_ORDER) {
    const distance = Math.abs(
      getSnapHeightPx(candidate, viewportHeight, collapsedHeightPx) - heightPx,
    );

    if (distance < smallestDistance) {
      smallestDistance = distance;
      nearest = candidate;
    }
  }

  return nearest;
};

// 논모달 이벤트 시트의 스냅 상태 (docs/13-race-console.md 원칙 2).
// 핸들 탭 → 다음 단계 순환, 포인터 드래그 → 놓으면 가장 가까운 스냅으로 CSS transition.
// 물리 기반 애니메이션은 범위 밖이다.
export const useEventSheetSnap = (
  // 가장 최근 Critical 이벤트의 id. 바뀌면 접힘 상태에서 1회 자동 확장한다.
  latestCriticalEventId: string | null,
  // 목록 첫 행의 실측 높이. 접힘 높이가 최신 1건을 온전히 담도록 하는 데 쓴다.
  firstRowHeightPx: number | null,
): EventSheetSnapController => {
  const collapsedHeightPx = getCollapsedHeightPx(firstRowHeightPx);
  const [snap, setSnap] = useState<EventSheetSnap>(EventSheetSnap.Default);
  const [dragHeightPx, setDragHeightPx] = useState<number | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(0);
  const didDragRef = useRef(false);
  // 이미 자동 확장에 사용한 이벤트 id. 사용자가 다시 접어도 같은 이벤트로는 재확장하지 않는다.
  const autoExpandedEventIdRef = useRef<string | null>(null);

  // Critical 이벤트 수신 시 기본 단계로 1회 자동 확장한다.
  // 이미 기본·펼침이면 건드리지 않는다(펼쳐 보던 사용자를 축소시키지 않기 위함).
  useEffect(() => {
    if (latestCriticalEventId === null) {
      return;
    }

    if (autoExpandedEventIdRef.current === latestCriticalEventId) {
      return;
    }

    autoExpandedEventIdRef.current = latestCriticalEventId;

    setSnap((previous) =>
      previous === EventSheetSnap.Collapsed ? EventSheetSnap.Default : previous,
    );
  }, [latestCriticalEventId]);

  const handleToggleSnap = useCallback(() => {
    // 드래그 직후 발생하는 click 은 무시한다(드래그로 이미 스냅이 정해졌다).
    if (didDragRef.current) {
      didDragRef.current = false;

      return;
    }

    setSnap((previous) => {
      const index = SNAP_ORDER.indexOf(previous);

      return SNAP_ORDER[(index + 1) % SNAP_ORDER.length] ?? EventSheetSnap.Default;
    });
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const height = sheetRef.current?.getBoundingClientRect().height;

      if (height === undefined) {
        return;
      }

      didDragRef.current = false;
      dragStartYRef.current = event.clientY;
      dragStartHeightRef.current = height;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragHeightPx(height);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (dragHeightPx === null) {
        return;
      }

      // 위로 끌면(clientY 감소) 시트가 커진다.
      const delta = dragStartYRef.current - event.clientY;

      if (Math.abs(delta) > DRAG_TAP_THRESHOLD_PX) {
        didDragRef.current = true;
      }

      const maxHeight = window.innerHeight * EXPANDED_HEIGHT_RATIO;
      const next = Math.min(
        Math.max(dragStartHeightRef.current + delta, collapsedHeightPx),
        maxHeight,
      );

      setDragHeightPx(next);
    },
    [dragHeightPx, collapsedHeightPx],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (dragHeightPx === null) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      // 실제로 끌었을 때만 스냅을 다시 계산한다. 제자리 탭은 click 이 순환을 맡는다.
      if (didDragRef.current) {
        setSnap(
          findNearestSnap(dragHeightPx, window.innerHeight, collapsedHeightPx),
        );
      }

      setDragHeightPx(null);
    },
    [dragHeightPx, collapsedHeightPx],
  );

  const getHeightStyle = (): string => {
    if (dragHeightPx !== null) {
      return `${dragHeightPx}px`;
    }

    if (snap === EventSheetSnap.Collapsed) {
      return `${collapsedHeightPx}px`;
    }

    if (snap === EventSheetSnap.Expanded) {
      return `${EXPANDED_HEIGHT_RATIO * 100}dvh`;
    }

    return `${DEFAULT_HEIGHT_RATIO * 100}dvh`;
  };

  return {
    snap,
    sheetRef,
    heightStyle: getHeightStyle(),
    isDragging: dragHeightPx !== null,
    handleToggleSnap,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
};
