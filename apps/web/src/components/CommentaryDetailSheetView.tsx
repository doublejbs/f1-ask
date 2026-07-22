"use client";

import { BottomSheetView } from "@/components/BottomSheetView";
import { CommentaryAskFooterView } from "@/components/CommentaryAskFooterView";
import { CommentaryDetailContentView } from "@/components/CommentaryDetailContentView";
import { useAskAi } from "@/hooks/UseAskAi";
import { Dictionary } from "@/i18n/Messages";
import {
  AiCommentary,
  ExplanationLevel,
  LiveRaceSnapshot,
  RaceEvent,
  SupportedLocale,
  buildLlmQuestionFocus,
} from "@f1/domain";
import { useEffect, useMemo, useState } from "react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  explanationLevel: ExplanationLevel;
  snapshot: LiveRaceSnapshot;
  // 원본 이벤트 역참조 · focus 조립에 쓰는 전체 이벤트.
  allEvents: RaceEvent[];
  favoriteDriverNumbers: number[];
  // 탭한 해설. null 이면 시트가 닫힌다.
  commentary: AiCommentary | null;
  onClose: () => void;
};

// 해설 상세 바텀 시트 (docs/21-commentary-ask.md). 캡션 탭으로 열린다.
// 오버레이·닫기·스크롤 잠금·포커스는 공유 BottomSheetView 가, 질문 상태는 여기서 관리한다.
//
// AI 탭(경기 전반 질문)과 별개의 useAskAi 인스턴스를 쓴다 — 스레드가 섞이지 않고, 이
// 경로에서만 focus 를 실어 보낸다. 기존 AI 탭은 focus 를 넘기지 않아 그대로 동작한다.
export const CommentaryDetailSheetView = ({
  dictionary,
  locale,
  explanationLevel,
  snapshot,
  allEvents,
  favoriteDriverNumbers,
  commentary,
  onClose,
}: Props) => {
  const { state, ask, reset } = useAskAi();
  const [input, setInput] = useState("");

  const commentaryId = commentary?.id ?? null;

  // 다른 해설로 바뀌면 이전 대화를 버린다 — 다른 이벤트의 맥락이 섞이면 안 된다.
  // 같은 해설을 닫았다 다시 열 때도(시트가 언마운트되지 않으므로) 깨끗한 스레드로 시작한다.
  useEffect(() => {
    reset();
    setInput("");
  }, [commentaryId, reset]);

  // 원본 이벤트(요약 표시용). 목록에서 밀려났으면 null.
  const sourceEvent = useMemo(() => {
    if (commentary === null) {
      return null;
    }

    return (
      allEvents.find((event) => event.id === commentary.sourceEventId) ?? null
    );
  }, [commentary, allEvents]);

  // 질문에 실을 focus. 시점 맥락이 없거나(옛/mock) 이벤트를 못 찾으면 null →
  // focus 없이 일반 질문으로 내려간다.
  const focus = useMemo(() => {
    if (commentary === null) {
      return null;
    }

    return buildLlmQuestionFocus(commentary, allEvents);
  }, [commentary, allEvents]);

  const isLoading = state.status === "loading";

  const submit = (question: string) => {
    if (question.trim() === "") {
      return;
    }

    void ask({
      question,
      locale,
      explanationLevel,
      snapshot,
      recentEvents: allEvents,
      favoriteDriverNumbers,
      // null 이면 프리필이 아니라 구조화 focus 를 넘긴다(문자열로 우겨넣지 않는다).
      focus: focus ?? undefined,
    });
  };

  const handleSubmit = () => {
    submit(input);
    setInput("");
  };

  return (
    <BottomSheetView
      isOpen={commentary !== null}
      onClose={onClose}
      titleId="commentary-sheet-title"
      closeLabel={dictionary.commentarySheet.close}
      footer={
        commentary !== null ? (
          <CommentaryAskFooterView
            dictionary={dictionary}
            value={input}
            isLoading={isLoading}
            onChange={setInput}
            onSubmit={handleSubmit}
          />
        ) : undefined
      }
    >
      {commentary !== null ? (
        <CommentaryDetailContentView
          dictionary={dictionary}
          locale={locale}
          commentary={commentary}
          sourceEvent={sourceEvent}
          hasFocus={focus !== null}
          turns={state.turns}
          isLoading={isLoading}
          isError={state.status === "error"}
        />
      ) : null}
    </BottomSheetView>
  );
};
