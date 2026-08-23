"use client";

import { Dictionary } from "@/i18n/Messages";
import { WeatherTransition, WeatherTransitionKind } from "@f1/domain";
import { CloudRain, Sun } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  // 활성 전환이 없으면 null — 그때는 배너를 그리지 않는다.
  transition: WeatherTransition | null;
};

// 날씨 전환 배너 (B3). 비 시작/트랙 건조는 전략 급변이라 눈에 띄게 알린다.
// 종류별로 색·아이콘·문구가 다르다. 세션 전체 사건이라 드라이버 탭 대상이 아니다.
export const WeatherTransitionBannerView = ({
  dictionary,
  transition,
}: Props) => {
  if (transition === null) {
    return null;
  }

  const texts = dictionary.weatherTransition;
  const isRain = transition.kind === WeatherTransitionKind.RainStarting;

  return (
    <div
      role="status"
      className={`animate-fade-up flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 ${
        isRain
          ? "bg-sky-500/15 text-sky-100 ring-1 ring-inset ring-sky-400/30"
          : "bg-amber-500/15 text-amber-100 ring-1 ring-inset ring-amber-400/30"
      }`}
    >
      {isRain ? (
        <CloudRain className="h-4 w-4 shrink-0 text-sky-300" aria-hidden />
      ) : (
        <Sun className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
      )}

      <div className="flex min-w-0 flex-col">
        <span className="text-[13px] font-semibold">
          {isRain ? texts.rainStarting : texts.trackDrying}
        </span>
        <span className="text-[11px] opacity-80">{texts.subtitle}</span>
      </div>
    </div>
  );
};
