"use client";

import { AskAiView, type AskAiPrefill } from "@/components/AskAiView";
import { Dictionary } from "@/i18n/Messages";
import {
  ExplanationLevel,
  LiveRaceSnapshot,
  RaceEvent,
  SupportedLocale,
} from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  explanationLevel: ExplanationLevel;
  snapshot: LiveRaceSnapshot;
  events: RaceEvent[];
  favoriteDriverNumbers: number[];
  prefill: AskAiPrefill | undefined;
};

// 「AI」 탭: Ask AI 대화 전용. 해설은 이벤트 피드 항목의 한 겹으로 옮겼다
// (docs/13-race-console.md 원칙 1). AskAiView 는 항상 마운트 상태를 유지하므로
// (LiveDashboardView 가 display 로만 숨김) 탭 전환에도 대화 스레드가 보존된다.
export const AskAiTabView = ({
  dictionary,
  locale,
  explanationLevel,
  snapshot,
  events,
  favoriteDriverNumbers,
  prefill,
}: Props) => (
  <div className="flex flex-col gap-4">
    <AskAiView
      dictionary={dictionary}
      locale={locale}
      explanationLevel={explanationLevel}
      snapshot={snapshot}
      // AI 컨텍스트는 우선순위로 거르지 않고 전부 받는다 (docs/10-race-events.md).
      events={events}
      favoriteDriverNumbers={favoriteDriverNumbers}
      prefill={prefill}
    />
  </div>
);
