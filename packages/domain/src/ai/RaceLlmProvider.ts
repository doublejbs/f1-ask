import { ExplanationLevel } from "../ExplanationLevel";
import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { RaceEvent } from "../RaceEvent";
import { RaceSummaryData } from "../RaceSummary";
import { SupportedLocale } from "../SupportedLocale";
import { AiConfidence } from "./AiConfidence";
import { CommentaryContext } from "./CommentaryContext";
import { LlmChatRole } from "./LlmChatRole";

// 멀티턴 대화의 한 발화. content 는 원문 텍스트만 담는다(데이터 JSON 은 제외).
export type LlmChatMessage = {
  role: LlmChatRole;
  content: string;
};

// 특정 해설(과거 이벤트)에 대한 질문의 초점.
// 사용자가 해설을 탭하고 그에 대해 물을 때 붙는다 (docs/21-commentary-ask.md §질문 경로 확장).
//
// "현재" 스냅샷이 아니라 해설이 생성 시 본 시점 맥락을 그대로 쓴다 — 12랩 페널티를 물어도
// 44랩 순위로 답하는 시점 어긋남(환각)을 막는다. 재조회하지 않고, 저장된 맥락을 실어 보낸다.
export type LlmQuestionFocus = {
  // 사용자가 탭한 해설의 원본 이벤트.
  event: RaceEvent;
  // 그 이벤트 시점에 해설이 본 순위 슬라이스·세션 상태. 해설 문서에 저장된 것과 같은 형태다.
  context: CommentaryContext;
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
  // 특정 해설에 대한 질문이면 그 이벤트와 시점 맥락. 없으면 경기 전반 질문(AI 탭)이다.
  focus?: LlmQuestionFocus;
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
  // 직전에 생성한 해설 텍스트(오래된 것 → 최근 순). 연속 이벤트가 같은 말을
  // 되풀이하지 않도록 프롬프트에 넣는다. 러닝 컨텍스트가 없는 호출자도 있어 optional 이다.
  recentCommentary?: string[];
};

export type LlmCommentary = {
  sourceEventId: string;
  text: string;
  // 결정론적 Mock provider 가 만든 간이 해설이면 true.
  // FallbackLlmProvider 로 폴백된 경우에도 Mock 자신이 표시하므로 별도 처리가 필요 없다.
  isMock?: boolean;
  // 이 해설을 만들 때 프롬프트에 실제로 넣은 시점 맥락. provider 가 buildCommentaryPrompt
  // 에서 받은 것을 그대로 실어 보내, 워커가 재계산 없이 해설 문서에 저장한다
  // (docs/21-commentary-ask.md §시점 맥락을 해설 문서에 저장한다).
  // mock provider 는 프롬프트를 만들지 않으므로 채우지 않는다 — 어차피 저장 대상이 아니다.
  pointInTimeContext?: CommentaryContext;
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
