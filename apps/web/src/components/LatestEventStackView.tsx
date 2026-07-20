"use client";

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

// 세로가 짧은 기기(iPhone SE, 667px)에서 숨기는 항목의 인덱스.
// 3건을 모두 고정하면 고정 영역이 뷰포트 35% 예산을 넘겨 순위를 잠식한다.
const OVERFLOW_ITEM_INDEX = 2;

// 위 항목에 붙이는 클래스. 700px 이상 높이에서만 보인다.
const OVERFLOW_ITEM_CLASS = "hidden [@media(min-height:700px)]:flex";

// 우선순위 점 색. Tailwind 퍼지 때문에 리터럴 클래스만 사용한다.
const getDotClass = (priority: RaceEventPriority): string =>
  priority === RaceEventPriority.Critical ? "bg-red-500" : "bg-amber-400";

// Critical 은 배경까지 붉게 틴트한다 — 없어진 Critical 배너의 역할을 흡수한다.
const getRowTintClass = (priority: RaceEventPriority): string =>
  priority === RaceEventPriority.Critical ? "bg-red-500/[0.10]" : "";

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

// 최근 주요 이벤트 스택 (docs/14-event-placement.md "최신 이벤트 카드"의 확장).
//
// Critical + High 중 최근 최대 3건을 최신순 한 줄 항목으로 쌓는다. 상단에 고정되므로
// 항목은 최대한 압축한다 — 점 + 문장(말줄임) + 상대 시각 한 줄이며 AI 해설은 넣지 않는다
// (해설은 드라이버 상세 시트에만 둔다. 고정 영역 높이 예산 때문).
// 이벤트가 없으면 렌더하지 않는다.
export const LatestEventStackView = ({
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

  // 드라이버가 특정되는 항목만 탭 가능하다.
  const rows = useMemo(
    () =>
      events.map((event) => ({
        event,
        driver: resolveEventDriver(event, drivers),
      })),
    [events, drivers],
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      aria-label={dictionary.latestEvent.title}
      className="glass-float animate-fade-up overflow-hidden rounded-2xl"
    >
      {rows.map(({ event, driver }, index) => {
        const rowClass = cn(
          "min-h-[44px] w-full items-center gap-2.5 px-3.5 py-2 text-left",
          index === OVERFLOW_ITEM_INDEX ? OVERFLOW_ITEM_CLASS : "flex",
          index > 0 ? "border-t border-white/[0.08]" : "",
          getRowTintClass(event.priority),
        );

        const body = (
          <>
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                getDotClass(event.priority),
              )}
            />

            <span className="flex-1 truncate text-[13px] font-semibold leading-snug text-foreground">
              {translateRaceEvent(event, locale)}
            </span>

            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {formatEventTime(event.timestamp, locale, atMs)}
            </span>
          </>
        );

        if (driver === null) {
          // 드라이버를 특정할 수 없으면 탭 불가이며 포커스 대상도 아니다.
          return (
            <div key={event.id} className={rowClass}>
              {body}
            </div>
          );
        }

        const handleSelect = () => {
          onSelectDriver(driver);
        };

        return (
          <button
            key={event.id}
            type="button"
            onClick={handleSelect}
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
        );
      })}
    </div>
  );
};
