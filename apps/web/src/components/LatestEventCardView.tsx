"use client";

import { EventCommentaryLineView } from "@/components/EventCommentaryLineView";
import { Dictionary } from "@/i18n/Messages";
import { translateRaceEvent } from "@/i18n/TranslateRaceEvent";
import { resolveEventDriver } from "@/lib/ResolveEventDriver";
import { selectLatestPriorityEvent } from "@/lib/SelectLatestPriorityEvent";
import { cn } from "@/lib/Utils";
import {
  AiCommentary,
  LiveDriverState,
  RaceEvent,
  RaceEventPriority,
  SupportedLocale,
} from "@f1/domain";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  allEvents: RaceEvent[];
  // 이벤트에 sourceEventId 로 결합되는 AI 해설.
  commentary: AiCommentary[];
  // 이벤트 → 드라이버 특정에 쓰는 로스터.
  drivers: LiveDriverState[];
  // 최신 판정 기준 시각(경기 시계).
  atMs: number;
  onSelectDriver: (driver: LiveDriverState) => void;
};

// 우선순위 액센트. Tailwind 퍼지 때문에 리터럴 클래스만 사용한다.
const getAccentClass = (priority: RaceEventPriority): string =>
  priority === RaceEventPriority.Critical ? "bg-red-500" : "bg-amber-400";

// 최신 이벤트 카드 (docs/14-event-placement.md "최신 이벤트 카드").
//
// Critical + High 중 가장 최근 1건 + (목이 아닌) AI 해설. 해설이 갈 곳이 여기와
// 드라이버 상세 시트뿐이라, LLM 이 실제로 동작할 때 해설이 평소에 보이는 유일한 자리다.
// 이벤트가 없으면 렌더하지 않는다.
export const LatestEventCardView = ({
  dictionary,
  locale,
  allEvents,
  commentary,
  drivers,
  atMs,
  onSelectDriver,
}: Props) => {
  const event = useMemo(
    () => selectLatestPriorityEvent(allEvents, atMs),
    [allEvents, atMs],
  );

  // 드라이버가 특정되는 이벤트만 탭 가능하다.
  const driver = useMemo(
    () => (event === null ? null : resolveEventDriver(event, drivers)),
    [event, drivers],
  );

  const eventCommentary = useMemo(() => {
    if (event === null) {
      return null;
    }

    return (
      commentary.find((item) => item.sourceEventId === event.id) ?? null
    );
  }, [commentary, event]);

  if (event === null) {
    return null;
  }

  const handleSelect = () => {
    if (driver === null) {
      return;
    }

    onSelectDriver(driver);
  };

  const sentence = (
    <span className="flex flex-1 items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          getAccentClass(event.priority),
        )}
      />

      <span className="flex-1 text-[15px] font-semibold leading-snug text-foreground">
        {translateRaceEvent(event, locale)}
      </span>

      {driver !== null ? (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground/50"
          aria-hidden
        />
      ) : null}
    </span>
  );

  return (
    <div
      aria-label={dictionary.latestEvent.title}
      className="glass-float animate-fade-up relative overflow-hidden rounded-2xl"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          getAccentClass(event.priority),
        )}
      />

      {driver !== null ? (
        <button
          type="button"
          onClick={handleSelect}
          aria-label={dictionary.latestEvent.openDriver.replace(
            "{code}",
            driver.code,
          )}
          className="press flex min-h-[44px] w-full items-center px-4 py-3 text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
        >
          {sentence}
        </button>
      ) : (
        // 드라이버를 특정할 수 없으면 탭 불가이며 포커스 대상도 아니다.
        <div className="flex min-h-[44px] w-full items-center px-4 py-3">
          {sentence}
        </div>
      )}

      {eventCommentary !== null ? (
        // 목 해설이면 EventCommentaryLineView 가 스스로 null 을 돌려준다.
        <EventCommentaryLineView
          dictionary={dictionary}
          commentary={eventCommentary}
        />
      ) : null}
    </div>
  );
};
