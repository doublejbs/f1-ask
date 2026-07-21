"use client";

import { useLatestEventNavigation } from "@/hooks/UseLatestEventNavigation";
import { Dictionary } from "@/i18n/Messages";
import { translateRaceEvent } from "@/i18n/TranslateRaceEvent";
import { resolveEventDriver } from "@/lib/ResolveEventDriver";
import { cn } from "@/lib/Utils";
import {
  LiveDriverState,
  RaceEvent,
  RaceEventPriority,
  SupportedLocale,
  selectLatestPriorityEvents,
} from "@f1/domain";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo } from "react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  allEvents: RaceEvent[];
  // 이벤트 → 드라이버 특정에 쓰는 로스터.
  drivers: LiveDriverState[];
  // 최신 판정 · 상대 시각 기준 시각(경기 시계).
  atMs: number;
  onSelectDriver: (driver: LiveDriverState) => void;
};

// 우선순위 점 색. Tailwind 퍼지 때문에 리터럴 클래스만 사용한다.
const getDotClass = (priority: RaceEventPriority): string =>
  priority === RaceEventPriority.Critical ? "bg-red-500" : "bg-amber-400";

// Critical 은 배경까지 붉게 틴트한다 — 없어진 Critical 배너의 역할을 흡수한다.
const getCardTintClass = (priority: RaceEventPriority): string =>
  priority === RaceEventPriority.Critical ? "bg-red-500/[0.10]" : "";

// 위/아래 버튼. 44×44 터치 타깃(iOS HIG 44pt)이며 양 끝에서는 흐려진 채 비활성화된다.
const NAV_BUTTON_CLASS =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-25";

// 상대 시각("n분 전")으로 표기하는 최대 간격. 이보다 벌어지면 시각 자체를 보여준다.
//
// 리플레이는 과거 캡처(2023년)를 재생하는데 스냅샷의 sourceUpdatedAt 은 freshness
// 기준선이라 현재 시각으로 다시 쓰인다. 그 차이를 그대로 상대 시각으로 찍으면
// "1,129,432분 전" 같은 무의미하고 긴 문자열이 나와 문장 자리를 잡아먹는다.
const RELATIVE_TIME_MAX_MS = 60 * 60 * 1000;

// 이벤트 시각을 한 칸에 들어가도록 압축한다.
// 기준 시각과 가까우면 "2분 전", 멀어지면 이벤트 자체의 시:분.
const formatEventTime = (
  iso: string,
  locale: SupportedLocale,
  atMs: number,
): string => {
  const eventMs = Date.parse(iso);

  if (Number.isNaN(eventMs)) {
    return "";
  }

  const diffMs = eventMs - atMs;

  if (Math.abs(diffMs) > RELATIVE_TIME_MAX_MS) {
    return new Date(eventMs).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const diffSeconds = Math.round(diffMs / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
    style: "narrow",
  });

  if (Math.abs(diffSeconds) < 60) {
    return formatter.format(diffSeconds, "second");
  }

  return formatter.format(Math.round(diffSeconds / 60), "minute");
};

// 최근 주요 이벤트 페이저 (docs/14-event-placement.md "최신 이벤트 카드"의 확장).
//
// Critical + High 중 최근 건들을 **한 번에 1건씩** 보여주고 위/아래 버튼으로 넘긴다.
// 여러 건을 쌓던 이전 방식은 고정 영역이 순위를 잠식해서, 높이는 1건으로 고정하고
// 깊이(LATEST_PRIORITY_EVENT_LIMIT)를 대신 늘렸다.
//
// 상단에 고정되므로 항목은 최대한 압축한다 — 점 + 문장(말줄임) + 상대 시각 한 줄이며
// AI 해설은 넣지 않는다(해설은 드라이버 상세 시트에만 둔다. 고정 영역 높이 예산 때문).
// 이벤트가 없으면 렌더하지 않는다.
export const LatestEventPagerView = ({
  dictionary,
  locale,
  allEvents,
  drivers,
  atMs,
  onSelectDriver,
}: Props) => {
  const events = useMemo(
    () => selectLatestPriorityEvents(allEvents, atMs),
    [allEvents, atMs],
  );

  // 커서는 인덱스가 아니라 이벤트 id 로 관리된다 — 6초마다 목록이 앞에서 자라기 때문.
  const {
    currentEvent,
    currentIndex,
    totalCount,
    canGoNewer,
    canGoOlder,
    handleGoNewer,
    handleGoOlder,
  } = useLatestEventNavigation(events);

  // 드라이버가 특정되는 이벤트만 탭 가능하다.
  const driver = useMemo(() => {
    if (currentEvent === null) {
      return null;
    }

    return resolveEventDriver(currentEvent, drivers);
  }, [currentEvent, drivers]);

  if (currentEvent === null) {
    return null;
  }

  const positionLabel = dictionary.latestEvent.position
    .replace("{current}", String(currentIndex + 1))
    .replace("{total}", String(totalCount));

  const rowClass =
    "flex min-h-[44px] w-full items-center gap-2.5 px-3.5 py-2 text-left";

  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          getDotClass(currentEvent.priority),
        )}
      />

      <span className="flex-1 truncate text-[13px] font-semibold leading-snug text-foreground">
        {translateRaceEvent(currentEvent, locale)}
      </span>

      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {formatEventTime(currentEvent.timestamp, locale, atMs)}
      </span>
    </>
  );

  const handleSelectDriver = () => {
    if (driver === null) {
      return;
    }

    onSelectDriver(driver);
  };

  return (
    // role="group" — 6초마다 내용이 바뀌므로 라이브 리전(role="status")으로 두면
    // 스크린리더가 갱신마다 문장을 다시 읽어 소음이 된다. 위치는 아래 sr-only 텍스트로 전달한다.
    <div
      role="group"
      aria-label={dictionary.latestEvent.title}
      className={cn(
        "glass-float animate-fade-up overflow-hidden rounded-2xl",
        getCardTintClass(currentEvent.priority),
      )}
    >
      {driver === null ? (
        // 드라이버를 특정할 수 없으면 탭 불가이며 포커스 대상도 아니다.
        <div className={rowClass}>{body}</div>
      ) : (
        <button
          type="button"
          onClick={handleSelectDriver}
          aria-label={dictionary.latestEvent.openDriver.replace(
            "{code}",
            driver.code,
          )}
          className={cn(
            rowClass,
            // press(scale 눌림) 미사용 — 탭하면 상세 시트 오버레이가 손가락
            // 아래에 깔려 pointerup 을 못 받고 :active 가 굳는다.
            "outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
          )}
        >
          {body}
        </button>
      )}

      {/* 1건뿐이면 넘길 곳이 없다 — 위치 표시("1/1")도 버튼도 정보가 없으므로 통째로 숨겨
          고정 영역을 44px 까지 줄인다. 2건 이상이 되는 순간 나타난다. */}
      {totalCount > 1 ? (
        <div className="flex items-center justify-end gap-1 border-t border-white/[0.08] pl-3.5 pr-1">
          <span
            aria-hidden
            className="mr-auto text-[11px] font-medium tabular-nums text-muted-foreground"
          >
            {currentIndex + 1}/{totalCount}
          </span>

          {/* 위치는 라이브 리전 없이 sr-only 텍스트로만 노출한다(버튼 라벨과 함께 읽힌다). */}
          <span className="sr-only">{positionLabel}</span>

          <button
            type="button"
            onClick={handleGoNewer}
            disabled={!canGoNewer}
            aria-label={dictionary.latestEvent.previousEvent}
            className={NAV_BUTTON_CLASS}
          >
            <ChevronUp aria-hidden className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleGoOlder}
            disabled={!canGoOlder}
            aria-label={dictionary.latestEvent.nextEvent}
            className={NAV_BUTTON_CLASS}
          >
            <ChevronDown aria-hidden className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
};
