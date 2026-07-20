"use client";

import { Dictionary } from "@/i18n/Messages";
import { translateRaceEvent } from "@/i18n/TranslateRaceEvent";
import { selectRecentCriticalEvent } from "@/lib/SelectRecentCriticalEvent";
import { RaceEvent, SupportedLocale } from "@f1/domain";
import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  allEvents: RaceEvent[];
  // 이벤트 탭 → 탭투애스크. driverCode 가 있을 때만 실제 질문이 제출된다.
  onSelectEvent: (event: RaceEvent) => void;
};

// 이벤트 타임스탬프를 "n분 전" 같은 상대 시각으로 표시한다.
const formatRelativeTime = (
  iso: string,
  locale: SupportedLocale,
  nowMs: number,
): string => {
  const eventMs = Date.parse(iso);

  if (Number.isNaN(eventMs)) {
    return "";
  }

  const diffSeconds = Math.round((eventMs - nowMs) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (Math.abs(diffSeconds) < 60) {
    return formatter.format(diffSeconds, "second");
  }

  return formatter.format(Math.round(diffSeconds / 60), "minute");
};

// 이벤트에서 탭투애스크 대상 드라이버 코드를 추출한다(없으면 null).
const getEventDriverCode = (event: RaceEvent): string | null => {
  const code = event.params.driverCode;

  return typeof code === "string" && code.length > 0 ? code : null;
};

// 최근 5분 내 Critical 이벤트를 상단 배너로 강조한다. 없으면 미표시.
// 닫으면 같은 이벤트는 다시 뜨지 않는다(dismissedId). "최근 5분" 판정은
// 클라이언트 시계 기준이라 리플레이(과거 타임스탬프)에서는 안 뜰 수 있다(허용).
export const CriticalBannerView = ({
  dictionary,
  locale,
  allEvents,
  onSelectEvent,
}: Props) => {
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const nowMs = Date.now();
  const event = selectRecentCriticalEvent(allEvents, nowMs);

  if (event === null || event.id === dismissedId) {
    return null;
  }

  const code = getEventDriverCode(event);
  const tappable = code !== null;

  const handleSelect = () => {
    onSelectEvent(event);
  };

  const handleDismiss = () => {
    setDismissedId(event.id);
  };

  const body = (
    <>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold leading-snug text-foreground">
          {translateRaceEvent(event, locale)}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatRelativeTime(event.timestamp, locale, nowMs)}
        </span>
      </span>
    </>
  );

  return (
    <div
      role="alert"
      className="glass-float animate-fade-up relative overflow-hidden rounded-2xl border-red-500/25 bg-red-500/[0.10]"
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px] bg-red-500"
        aria-hidden
      />
      <div className="flex items-stretch">
        {tappable ? (
          <button
            type="button"
            onClick={handleSelect}
            className="flex min-h-[44px] flex-1 items-start gap-2.5 px-4 py-3 text-left outline-none transition-colors hover:bg-red-500/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
          >
            {body}
          </button>
        ) : (
          <div className="flex min-h-[44px] flex-1 items-start gap-2.5 px-4 py-3">
            {body}
          </div>
        )}

        <button
          type="button"
          onClick={handleDismiss}
          aria-label={dictionary.criticalBanner.dismiss}
          className="press flex min-h-[44px] w-11 shrink-0 items-center justify-center text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
