"use client";

import { EventFeedFilterView } from "@/components/EventFeedFilterView";
import { SectionView } from "@/components/ui/SectionView";
import { useEventFeedState } from "@/hooks/UseEventFeedState";
import { Dictionary } from "@/i18n/Messages";
import { translateRaceEvent } from "@/i18n/TranslateRaceEvent";
import { EventFeedFilterMode } from "@/lib/EventFeedFilterMode";
import { cn } from "@/lib/Utils";
import { RaceEvent, RaceEventPriority, SupportedLocale } from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  // 주요(Critical + High) 이벤트. 기본 모드에서 그린다.
  primaryEvents: RaceEvent[];
  // 우선순위 무관 전체 이벤트. "전체 보기" 모드에서 그린다.
  allEvents: RaceEvent[];
  onSelectEvent?: (event: RaceEvent) => void;
};

const MAX_EVENTS = 12;

// 행 내부 레이아웃. 탭 가능 여부에 따라 button / div 로 감싸므로 클래스를 공유한다.
const ROW_CLASS =
  "flex w-full min-h-[44px] items-center gap-2.5 py-3 pl-3 pr-1 text-left text-[15px] leading-snug";

// 우선순위 점 색. Tailwind 퍼지 때문에 리터럴 클래스만 사용한다.
const getPriorityDotColor = (priority: RaceEventPriority): string => {
  switch (priority) {
    case RaceEventPriority.Critical:
      return "bg-red-400";
    case RaceEventPriority.High:
      return "bg-amber-400";
    case RaceEventPriority.Medium:
      return "bg-sky-400";
    default:
      return "bg-white/30";
  }
};

const formatClock = (iso: string): string => {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

// 이벤트에서 탭투애스크 대상이 되는 드라이버 코드를 추출한다(없으면 null).
const getEventDriverCode = (event: RaceEvent): string | null => {
  const code = event.params.driverCode;

  return typeof code === "string" && code.length > 0 ? code : null;
};

// 최근 이벤트 피드. 이벤트는 locale 에 따라 번역해 표시한다.
// 기본은 Critical + High 만 노출하고, "전체" 로 전환하면 Low / Medium 까지 보여준다.
// 드라이버가 연관된 이벤트는 탭하면 Ask AI 로 질문을 자동 제출한다(onSelectEvent).
export const EventFeedView = ({
  dictionary,
  locale,
  primaryEvents,
  allEvents,
  onSelectEvent,
}: Props) => {
  const { mode, visibleEvents, hiddenCount, handleChangeMode } =
    useEventFeedState(primaryEvents, allEvents, MAX_EVENTS);
  const showsHiddenNote =
    mode === EventFeedFilterMode.Primary && hiddenCount > 0;

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
      {visibleEvents.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">
          {dictionary.events.empty}
        </p>
      ) : (
        <ul className="flex flex-col">
          {visibleEvents.map((event, index) => {
            const code = getEventDriverCode(event);
            const tappable = onSelectEvent !== undefined && code !== null;
            const critical = event.priority === RaceEventPriority.Critical;
            const divided = index < visibleEvents.length - 1;
            const priorityLabel = dictionary.eventPriority[event.priority];
            const handleSelect = () => onSelectEvent?.(event);
            // 탭 가능한 항목만 네이티브 button 으로 감싼다. 클릭해도 아무 일도 없는
            // 항목까지 포커스 가능하게 만들면 키보드 사용자가 빈 항목을 타넘게 된다.
            const content = (
              <>
                {/* 배지 대신 작은 컬러 점. 우선순위 라벨은 스크린리더·툴팁으로 남긴다. */}
                <span
                  role="img"
                  aria-label={priorityLabel}
                  title={priorityLabel}
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    getPriorityDotColor(event.priority),
                  )}
                />
                <span className="flex-1">
                  {translateRaceEvent(event, locale)}
                </span>
                <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {formatClock(event.timestamp)}
                </span>
              </>
            );

            return (
              <li
                key={event.id}
                className={cn(
                  "relative",
                  divided && "hairline",
                  // Critical 은 좌측 액센트 바로 시선을 끈다.
                  critical &&
                    "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-full before:bg-red-400/80",
                )}
              >
                {tappable ? (
                  <button
                    type="button"
                    onClick={handleSelect}
                    className={cn(
                      ROW_CLASS,
                      "press cursor-pointer outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
                    )}
                  >
                    {content}
                  </button>
                ) : (
                  <div className={ROW_CLASS}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showsHiddenNote ? (
        <p className="px-1 pt-1 text-xs text-muted-foreground">
          {dictionary.events.hiddenCount.replace(
            "{count}",
            String(hiddenCount),
          )}
        </p>
      ) : null}
    </SectionView>
  );
};
