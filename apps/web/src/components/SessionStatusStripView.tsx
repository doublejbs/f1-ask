"use client";

import { Dictionary } from "@/i18n/Messages";
import { translateSessionState } from "@/i18n/TranslateSessionState";
import { cn } from "@/lib/Utils";
import {
  ActiveSessionState,
  RaceEvent,
  SessionStateSeverity,
  SupportedLocale,
  selectActiveSessionStates,
} from "@f1/domain";
import { useMemo } from "react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  allEvents: RaceEvent[];
  // 활성 상태 판정 기준 시각(경기 시계). 리플레이에서도 올바르게 접힌다.
  atMs: number;
};

// 심각도별 칩 색. Tailwind 퍼지 때문에 리터럴 클래스만 사용한다.
// 색은 보조 신호일 뿐이며 의미는 라벨과 title/aria-label 이 전달한다.
const getSeverityClass = (severity: SessionStateSeverity): string => {
  switch (severity) {
    case SessionStateSeverity.Critical:
      return "border-red-500/35 bg-red-500/15 text-red-200";
    case SessionStateSeverity.High:
      return "border-amber-500/35 bg-amber-500/15 text-amber-200";
    case SessionStateSeverity.Caution:
      return "border-yellow-400/35 bg-yellow-400/12 text-yellow-100";
    default:
      return "text-muted-foreground";
  }
};

// 활성 상태 하나를 식별하는 키. 섹터 옐로는 섹터별로, 트랙 위험물은 종류별로 독립이라
// 타입만으로는 키가 겹친다. 열린 시각을 붙여 확실히 구분한다.
const buildStateKey = (state: ActiveSessionState): string =>
  `${state.type}:${state.sector ?? "-"}:${state.sinceTimestamp}`;

// 상단 활성 세션 상태 스트립 (docs/14-event-placement.md "세션 상태 → 상단 스트립").
//
// 시간순 피드가 아니라 **현재 활성 집합**이다. "세이프티카가 30초 전에 전개됐다"가
// 아니라 "지금 세이프티카 상황인가"를 보여준다. 활성 상태가 없으면 렌더하지 않는다.
//
// 세로로 늘어나면 순위가 아래로 밀리므로 줄바꿈하지 않고 가로 스크롤한다.
export const SessionStatusStripView = ({
  dictionary,
  locale,
  allEvents,
  atMs,
}: Props) => {
  // 도메인 셀렉터가 심각도 → 최신순으로 정렬해 돌려주므로 그대로 나열한다.
  const states = useMemo(
    () => selectActiveSessionStates(allEvents, atMs),
    [allEvents, atMs],
  );

  if (states.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      aria-label={dictionary.sessionStrip.title}
      // -mx-1/px-1 로 스크롤 컨테이너가 칩 그림자를 자르지 않게 여백을 준다.
      className="scroll-slim -mx-1 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1 py-0.5"
    >
      {states.map((state) => {
        const label = translateSessionState(state, locale);
        const description = `${label} — ${dictionary.sessionStrip.severity[state.severity]}`;

        return (
          <span
            key={buildStateKey(state)}
            title={description}
            aria-label={description}
            className={cn(
              "glass-chip shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
              getSeverityClass(state.severity),
            )}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
};
