"use client";

import {
  ExplanationLevel,
  LiveRaceSnapshot,
  LlmAnswer,
  LlmChatRole,
  LlmQuestionFocus,
  RaceEvent,
  SupportedLocale,
} from "@f1/domain";
import { parseLlmAnswer } from "@f1/schemas";
import { useCallback, useRef, useState } from "react";

export type AskAiStatus = "idle" | "loading" | "success" | "error";

// 대화 스레드의 한 턴. user 는 질문 텍스트, assistant 는 답변 텍스트 + metadata.
export type ChatTurn = {
  role: LlmChatRole;
  content: string;
  answer?: LlmAnswer;
};

export type AskAiState = {
  status: AskAiStatus;
  turns: ChatTurn[];
};

export type AskAiInput = {
  question: string;
  locale: SupportedLocale;
  explanationLevel: ExplanationLevel;
  snapshot: LiveRaceSnapshot;
  recentEvents: RaceEvent[];
  favoriteDriverNumbers: number[];
  // 특정 해설에 대한 질문이면 그 이벤트와 시점 맥락. AI 탭(경기 전반 질문)은 넘기지
  // 않으므로 undefined 로 남아 body 에서 빠진다 — 기존 경로가 그대로 동작한다.
  focus?: LlmQuestionFocus;
};

export type AskAiController = {
  state: AskAiState;
  ask: (input: AskAiInput) => Promise<void>;
  reset: () => void;
};

const INITIAL_STATE: AskAiState = {
  status: "idle",
  turns: [],
};

// 서버로 보낼 최대 히스토리 턴 수(토큰 절약). 3 왕복 = 6 턴.
const HISTORY_TURN_LIMIT = 6;

// Ask AI 멀티턴 대화 컨트롤러.
// 스레드를 유지하며 이전 Q&A 텍스트를 서버(/api/ask)로 함께 보낸다.
// 현재 경기 데이터는 서버가 이번 질문에만 첨부하므로, 히스토리는 원문 텍스트만 담는다.
export const useAskAi = (): AskAiController => {
  const [state, setState] = useState<AskAiState>(INITIAL_STATE);
  // 클로저 안에서 최신 스레드를 읽기 위한 mirror.
  const turnsRef = useRef<ChatTurn[]>([]);

  const ask = useCallback(async (input: AskAiInput) => {
    const question = input.question.trim();

    if (question.length === 0) {
      return;
    }

    // 히스토리는 assistant 로 끝나야 한다(직전 실패로 남은 user 턴은 제외).
    const prior = turnsRef.current;
    let end = prior.length;

    while (end > 0 && prior[end - 1]?.role === LlmChatRole.User) {
      end -= 1;
    }

    const history = prior
      .slice(0, end)
      .slice(-HISTORY_TURN_LIMIT)
      .map((turn) => ({ role: turn.role, content: turn.content }));

    const userTurn: ChatTurn = { role: LlmChatRole.User, content: question };
    const optimistic = [...prior, userTurn];

    turnsRef.current = optimistic;
    setState({ status: "loading", turns: optimistic });

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          locale: input.locale,
          explanationLevel: input.explanationLevel,
          snapshot: input.snapshot,
          recentEvents: input.recentEvents,
          favoriteDriverNumbers: input.favoriteDriverNumbers,
          conversationHistory: history,
          // undefined 면 JSON 직렬화에서 빠진다 — 서버는 focus 없는 일반 질문으로 처리한다.
          focus: input.focus,
        }),
      });

      if (!response.ok) {
        throw new Error(`request failed: ${response.status}`);
      }

      const answer = parseLlmAnswer(await response.json());
      const assistantTurn: ChatTurn = {
        role: LlmChatRole.Assistant,
        content: answer.answer,
        answer,
      };
      const withAnswer = [...turnsRef.current, assistantTurn];

      turnsRef.current = withAnswer;
      setState({ status: "success", turns: withAnswer });
    } catch {
      // 실패 시 낙관적으로 추가한 user 턴을 되돌려 스레드를 깨끗하게 유지한다.
      const rolledBack = turnsRef.current.slice(0, -1);

      turnsRef.current = rolledBack;
      setState({ status: "error", turns: rolledBack });
    }
  }, []);

  const reset = useCallback(() => {
    turnsRef.current = [];
    setState(INITIAL_STATE);
  }, []);

  return { state, ask, reset };
};
