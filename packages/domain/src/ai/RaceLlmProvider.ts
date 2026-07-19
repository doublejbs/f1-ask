import { ExplanationLevel } from "../ExplanationLevel";
import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { RaceEvent } from "../RaceEvent";
import { RaceSummaryData } from "../RaceSummary";
import { SupportedLocale } from "../SupportedLocale";
import { AiConfidence } from "./AiConfidence";
import { LlmChatRole } from "./LlmChatRole";

// 멀티턴 대화의 한 발화. content 는 원문 텍스트만 담는다(데이터 JSON 은 제외).
export type LlmChatMessage = {
  role: LlmChatRole;
  content: string;
};

// AI 질문 요청. 특정 provider(OpenAI 등)에 종속되지 않는 내부 모델이다.
// (docs/02-architecture.md §2.6 Provider Independence)
export type LlmQuestionRequest = {
  question: string;
  locale: SupportedLocale;
  explanationLevel: ExplanationLevel;
  snapshot: LiveRaceSnapshot;
  recentEvents: RaceEvent[];
  favoriteDriverNumbers: number[];
  // 이전 대화 턴(원문 Q&A 텍스트만). 현재 데이터는 이번 질문에만 첨부된다.
  conversationHistory?: LlmChatMessage[];
};

// AI 답변 + metadata (docs/02-architecture.md §42.3 AiQuestionResponse).
export type LlmAnswer = {
  answer: string;
  confidence: AiConfidence;
  insufficientData: boolean;
  dataTimestamp: string;
  snapshotVersion: number;
  referencedDriverNumbers: number[];
  referencedEventIds: string[];
  suggestedQuestions: string[];
};

// AI 자동 해설 요청. 특정 이벤트의 "의미"를 설명한다.
export type LlmCommentaryRequest = {
  event: RaceEvent;
  locale: SupportedLocale;
  explanationLevel: ExplanationLevel;
  snapshot: LiveRaceSnapshot;
};

export type LlmCommentary = {
  sourceEventId: string;
  text: string;
};

// 경기 종료 요약 서술 요청. 사실(RaceSummaryData)은 도메인이 계산한 값이다.
export type LlmSummaryRequest = {
  summary: RaceSummaryData;
  snapshot: LiveRaceSnapshot;
  locale: SupportedLocale;
};

export type LlmSummary = {
  text: string;
};

// LLM provider 추상화. 서비스 코드는 항상 이 인터페이스로 호출한다.
// (실제 OpenAI provider 로 교체 가능 — LLM 은 경기 데이터를 계산하지 않는다.)
export interface RaceLlmProvider {
  answerQuestion(request: LlmQuestionRequest): Promise<LlmAnswer>;
  generateCommentary(request: LlmCommentaryRequest): Promise<LlmCommentary>;
  generateSummary(request: LlmSummaryRequest): Promise<LlmSummary>;
}
