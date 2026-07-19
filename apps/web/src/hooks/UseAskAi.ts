"use client";

import {
  ExplanationLevel,
  LiveRaceSnapshot,
  LlmAnswer,
  RaceEvent,
  SupportedLocale,
} from "@f1/domain";
import { parseLlmAnswer } from "@f1/schemas";
import { useCallback, useState } from "react";

export type AskAiStatus = "idle" | "loading" | "success" | "error";

export type AskAiState = {
  status: AskAiStatus;
  question: string;
  answer: LlmAnswer | null;
};

export type AskAiInput = {
  question: string;
  locale: SupportedLocale;
  explanationLevel: ExplanationLevel;
  snapshot: LiveRaceSnapshot;
  recentEvents: RaceEvent[];
  favoriteDriverNumbers: number[];
};

export type AskAiController = {
  state: AskAiState;
  ask: (input: AskAiInput) => Promise<void>;
  reset: () => void;
};

const INITIAL_STATE: AskAiState = {
  status: "idle",
  question: "",
  answer: null,
};

// Ask AI 클라이언트 컨트롤러.
// 질문을 서버 AI Gateway(/api/ask)로 보내고 응답을 검증해 상태로 노출한다.
export const useAskAi = (): AskAiController => {
  const [state, setState] = useState<AskAiState>(INITIAL_STATE);

  const ask = useCallback(async (input: AskAiInput) => {
    const question = input.question.trim();

    if (question.length === 0) {
      return;
    }

    setState({ status: "loading", question, answer: null });

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, question }),
      });

      if (!response.ok) {
        throw new Error(`request failed: ${response.status}`);
      }

      const answer = parseLlmAnswer(await response.json());

      setState({ status: "success", question, answer });
    } catch {
      setState({ status: "error", question, answer: null });
    }
  }, []);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { state, ask, reset };
};
