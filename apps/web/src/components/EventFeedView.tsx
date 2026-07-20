"use client";

import { EventFeedFilterView } from "@/components/EventFeedFilterView";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
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
const ROW_CLASS = "flex w-full items-start gap-2 px-4 py-2.5 text-left text-sm";

const getPriorityVariant = (
  priority: RaceEventPriority,
): NonNullable<BadgeProps["variant"]> => {
  switch (priority) {
    case RaceEventPriority.Critical:
      return "critical";
    case RaceEventPriority.High:
      return "high";
    case RaceEventPriority.Medium:
      return "medium";
    default:
      return "low";
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
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{dictionary.events.title}</CardTitle>
        <EventFeedFilterView
          dictionary={dictionary}
          mode={mode}
          onChangeMode={handleChangeMode}
        />
      </CardHeader>
      <CardContent className="p-0">
        {visibleEvents.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            {dictionary.events.empty}
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {visibleEvents.map((event) => {
              const code = getEventDriverCode(event);
              const tappable = onSelectEvent !== undefined && code !== null;
              const critical = event.priority === RaceEventPriority.Critical;
              const handleSelect = () => onSelectEvent?.(event);
              // 탭 가능한 항목만 네이티브 button 으로 감싼다. 클릭해도 아무 일도 없는
              // 항목까지 포커스 가능하게 만들면 키보드 사용자가 빈 항목을 타넘게 된다.
              const content = (
                <>
                  <Badge variant={getPriorityVariant(event.priority)}>
                    {dictionary.eventPriority[event.priority]}
                  </Badge>
                  <span className="flex-1">
                    {translateRaceEvent(event, locale)}
                  </span>
                  <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {formatClock(event.timestamp)}
                  </span>
                </>
              );

              return (
                <li
                  key={event.id}
                  className={cn(
                    "relative",
                    // Critical 은 좌측 액센트 바로 시선을 끈다.
                    critical &&
                      "bg-red-500/[0.06] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-red-400/80",
                  )}
                >
                  {tappable ? (
                    <button
                      type="button"
                      onClick={handleSelect}
                      className={cn(
                        ROW_CLASS,
                        "cursor-pointer outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
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
          <p className="border-t border-border/50 px-4 py-2 text-xs text-muted-foreground">
            {dictionary.events.hiddenCount.replace(
              "{count}",
              String(hiddenCount),
            )}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};
