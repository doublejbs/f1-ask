"use client";

import { DriverFilterChipView } from "@/components/DriverFilterChipView";
import { EventFeedFilterView } from "@/components/EventFeedFilterView";
import { EventFeedListView } from "@/components/EventFeedListView";
import { DriverEventFilterTarget } from "@/hooks/UseDriverEventFilter";
import { MAX_FEED_EVENTS, useEventFeedState } from "@/hooks/UseEventFeedState";
import {
  TAB_BAR_INSET_PX,
  useEventSheetSnap,
} from "@/hooks/UseEventSheetSnap";
import { Dictionary } from "@/i18n/Messages";
import { EventSheetSnap } from "@/lib/EventSheetSnap";
import { cn } from "@/lib/Utils";
import {
  AiCommentary,
  RaceEvent,
  RaceEventPriority,
  SupportedLocale,
} from "@f1/domain";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  // 주요(Critical + High) 이벤트. 기본 모드에서 그린다.
  primaryEvents: RaceEvent[];
  // 우선순위 무관 전체 이벤트. "전체 보기" 모드 + Critical 자동 확장 판정에 쓴다.
  allEvents: RaceEvent[];
  // 이벤트에 sourceEventId 로 결합되는 AI 해설. 없으면 윗줄만 그린다.
  commentary: AiCommentary[];
  // 적용 중인 드라이버 필터. 우선순위 모드와 AND 로 걸린다.
  driverFilter: DriverEventFilterTarget | null;
  onClearDriverFilter: () => void;
  onSelectEvent?: (event: RaceEvent) => void;
};

// aria-controls 가 가리키는 스크롤 영역 id.
const SHEET_LIST_ID = "event-sheet-list";

// 가장 최근 Critical 이벤트의 id. 없으면 null.
// allEvents 는 오래된 순이라 뒤에서부터 찾는다.
const findLatestCriticalEventId = (events: RaceEvent[]): string | null => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event !== undefined && event.priority === RaceEventPriority.Critical) {
      return event.id;
    }
  }

  return null;
};

// 논모달 이벤트 바텀 시트(모바일 전용) — docs/13-race-console.md 원칙 2.
// 순위(뒤) 위에 떠서 순위와 이벤트를 동시에 보게 한다. 접힘에서도 최신 1건이 보인다.
//
// 모달이 아니므로 role="dialog" / aria-modal 을 쓰지 않는다. 뒤 콘텐츠는 계속
// 조작 가능하고 포커스도 갇히지 않는다. 상태는 핸들 버튼의 aria-expanded 로 알린다.
//
// 필터는 고정 크롬에, 목록만 스크롤 영역에 둔다. 섹션 헤더가 스크롤 영역에 있으면
// 접힘 상태에서 헤더가 유일한 가시 행을 차지해 최신 이벤트가 밀려난다.
export const EventSheetView = ({
  dictionary,
  locale,
  primaryEvents,
  allEvents,
  commentary,
  driverFilter,
  onClearDriverFilter,
  onSelectEvent,
}: Props) => {
  const { mode, visibleEvents, hiddenCount, handleChangeMode } =
    useEventFeedState(
      primaryEvents,
      allEvents,
      MAX_FEED_EVENTS,
      driverFilter,
    );

  const latestCriticalEventId = useMemo(
    () => findLatestCriticalEventId(allEvents),
    [allEvents],
  );

  const listRef = useRef<HTMLDivElement | null>(null);
  const [firstRowHeightPx, setFirstRowHeightPx] = useState<number | null>(null);

  // 접힘 높이는 "최신 1건"을 온전히 담아야 한다. 인시던트 문장은 3줄까지 접히고
  // 해설 줄이 붙기도 해 행 높이가 고정이 아니므로 첫 행을 실측한다.
  const firstEventId = visibleEvents[0]?.id ?? null;

  useEffect(() => {
    const row = listRef.current?.querySelector("li");

    if (row === null || row === undefined) {
      setFirstRowHeightPx(null);

      return;
    }

    const measure = () => {
      setFirstRowHeightPx(row.getBoundingClientRect().height);
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(row);

    return () => observer.disconnect();
  }, [firstEventId]);

  const {
    snap,
    sheetRef,
    heightStyle,
    isDragging,
    handleRaiseToDefault,
    handleToggleSnap,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useEventSheetSnap(latestCriticalEventId, firstRowHeightPx);

  // 필터를 새로 걸었는데 시트가 접혀 있으면 결과가 보이지 않는다. 기본 단계로 올린다.
  // 해제(null)에서는 사용자가 정한 단계를 건드리지 않는다.
  const filteredDriverNumber = driverFilter?.driverNumber ?? null;

  useEffect(() => {
    if (filteredDriverNumber === null) {
      return;
    }

    handleRaiseToDefault();
  }, [filteredDriverNumber, handleRaiseToDefault]);

  return (
    <section
      ref={sheetRef}
      aria-label={dictionary.eventSheet.label}
      // 떠 있는 탭바가 목록을 가리지 않도록 시트 안쪽을 실측 인셋만큼 띄운다.
      // 스크롤 영역 밖(시트 패딩)에 두어야 스크롤 박스 자체가 탭바 위에서 끝나
      // 접힘 상태에서 두 번째 행이 탭바 뒤로 비쳐 보이지 않는다.
      style={{ height: heightStyle, paddingBottom: `${TAB_BAR_INSET_PX}px` }}
      className={cn(
        "glass-sheet fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[1.75rem] lg:hidden",
        // 드래그 중에는 손가락을 그대로 따라와야 하므로 전환을 끈다.
        !isDragging && "transition-[height] duration-300 ease-out",
      )}
    >
      {/* 고정 크롬: 그랩 핸들(전면) + 필터(그 위 z-10). 44pt 터치 타깃. */}
      <div className="relative flex h-11 shrink-0 items-center justify-end px-3">
        <button
          type="button"
          onClick={handleToggleSnap}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          aria-label={dictionary.eventSheet.handle}
          aria-expanded={snap !== EventSheetSnap.Collapsed}
          aria-controls={SHEET_LIST_ID}
          className="absolute inset-0 flex cursor-grab touch-none items-center justify-center rounded-t-[1.75rem] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 active:cursor-grabbing"
        >
          <span className="h-1 w-10 rounded-full bg-white/25" aria-hidden />
        </button>

        <div className="relative z-10 flex items-center gap-2">
          <DriverFilterChipView
            dictionary={dictionary}
            driverFilter={driverFilter}
            onClear={onClearDriverFilter}
          />

          <EventFeedFilterView
            dictionary={dictionary}
            mode={mode}
            onChangeMode={handleChangeMode}
          />
        </div>
      </div>

      {/* 스크롤 영역: 목록만. 시트 끝에서 뒤 순위 목록으로 스크롤이 새지 않게 contain. */}
      <div
        id={SHEET_LIST_ID}
        ref={listRef}
        className="scroll-slim min-h-0 flex-1 overflow-y-auto overscroll-contain px-1"
      >
        <EventFeedListView
          dictionary={dictionary}
          locale={locale}
          visibleEvents={visibleEvents}
          commentary={commentary}
          hiddenCount={hiddenCount}
          emptyLabel={
            driverFilter === null ? undefined : dictionary.events.emptyForDriver
          }
          onSelectEvent={onSelectEvent}
        />
      </div>
    </section>
  );
};
