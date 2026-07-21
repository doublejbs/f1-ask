"use client";

import { Dictionary } from "@/i18n/Messages";
import { translateRaceEvent } from "@/i18n/TranslateRaceEvent";
import { getPriorityDotColor } from "@/lib/EventPriorityColor";
import { formatRadioClock } from "@/lib/TeamRadio";
import { cn } from "@/lib/Utils";
import { RaceEvent, SupportedLocale } from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  events: RaceEvent[];
};

// 주요 이벤트 타임라인. 드라이버 상세 시트의 이벤트 이력과 같은 표현을 쓴다 —
// 우선순위 점 + 번역된 문장 + 시각. 끝난 경기라 경기 순서(오래된 것 먼저)로 읽는다.
export const ArchiveEventTimelineView = ({
  dictionary,
  locale,
  events,
}: Props) => {
  if (events.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-bold uppercase tracking-[0.1em] text-foreground/80">
        {dictionary.archive.timeline}
      </h3>

      <ul className="flex flex-col">
        {events.map((event, index) => {
          const priorityLabel = dictionary.eventPriority[event.priority];

          return (
            <li
              key={event.id}
              className={cn(index < events.length - 1 && "hairline")}
            >
              <div className="flex items-center gap-2.5 py-2.5 text-[15px] leading-snug">
                {/* 색에만 의존하지 않도록 라벨을 title/aria-label 로 함께 남긴다. */}
                <span
                  role="img"
                  aria-label={priorityLabel}
                  title={priorityLabel}
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    getPriorityDotColor(event.priority),
                  )}
                />

                {event.lapNumber === undefined ? null : (
                  <span className="w-8 shrink-0 text-xs tabular-nums text-muted-foreground">
                    L{event.lapNumber}
                  </span>
                )}

                <span className="flex-1">
                  {translateRaceEvent(event, locale)}
                </span>

                <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {formatRadioClock(event.timestamp)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
