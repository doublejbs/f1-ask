"use client";

import { EventFeedFilterView } from "@/components/EventFeedFilterView";
import { EventFeedListView } from "@/components/EventFeedListView";
import { SectionView } from "@/components/ui/SectionView";
import { MAX_FEED_EVENTS, useEventFeedState } from "@/hooks/UseEventFeedState";
import { Dictionary } from "@/i18n/Messages";
import { AiCommentary, RaceEvent, SupportedLocale } from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  // 주요(Critical + High) 이벤트. 기본 모드에서 그린다.
  primaryEvents: RaceEvent[];
  // 우선순위 무관 전체 이벤트. "전체 보기" 모드에서 그린다.
  allEvents: RaceEvent[];
  // 이벤트에 sourceEventId 로 결합되는 AI 해설. 없으면 윗줄만 그린다.
  commentary: AiCommentary[];
  onSelectEvent?: (event: RaceEvent) => void;
};

// 최근 이벤트 피드(데스크톱 가운데 컬럼). 이벤트는 locale 에 따라 번역해 표시한다.
// 기본은 Critical + High 만 노출하고, "전체" 로 전환하면 Low / Medium 까지 보여준다.
// 드라이버가 연관된 이벤트는 탭하면 Ask AI 로 질문을 자동 제출한다(onSelectEvent).
//
// 모바일에서는 이 섹션 대신 EventSheetView(논모달 바텀 시트)가 같은 목록을 그린다.
export const EventFeedView = ({
  dictionary,
  locale,
  primaryEvents,
  allEvents,
  commentary,
  onSelectEvent,
}: Props) => {
  const { mode, visibleEvents, hiddenCount, handleChangeMode } =
    useEventFeedState(primaryEvents, allEvents, MAX_FEED_EVENTS);

  return (
    <SectionView
      title={dictionary.events.title}
      action={
        <EventFeedFilterView
          dictionary={dictionary}
          mode={mode}
          onChangeMode={handleChangeMode}
        />
      }
    >
      <EventFeedListView
        dictionary={dictionary}
        locale={locale}
        visibleEvents={visibleEvents}
        commentary={commentary}
        hiddenCount={hiddenCount}
        onSelectEvent={onSelectEvent}
      />
    </SectionView>
  );
};
