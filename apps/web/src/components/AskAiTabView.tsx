"use client";

import { AiCommentaryView } from "@/components/AiCommentaryView";
import { AskAiView, type AskAiPrefill } from "@/components/AskAiView";
import { Dictionary } from "@/i18n/Messages";
import {
  AiCommentary,
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
  commentary: AiCommentary[];
  favoriteDriverNumbers: number[];
  prefill: AskAiPrefill | undefined;
};

// 「AI」 탭: AI 해설(상단) → Ask AI 대화. AskAiView 는 항상 마운트 상태를 유지하므로
// (LiveDashboardView 가 display 로만 숨김) 탭 전환에도 대화 스레드가 보존된다.
export const AskAiTabView = ({
  dictionary,
  locale,
  explanationLevel,
  snapshot,
  events,
  commentary,
  favoriteDriverNumbers,
  prefill,
}: Props) => (
  <div className="flex flex-col gap-4">
    <AiCommentaryView dictionary={dictionary} commentary={commentary} />

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
