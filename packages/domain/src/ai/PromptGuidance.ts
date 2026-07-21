import { ExplanationLevel } from "../ExplanationLevel";
import { SupportedLocale } from "../SupportedLocale";

// provider 를 가리지 않는 프롬프트 조각. Q&A · 해설 · 요약이 함께 쓴다.
//
// 이전에는 Claude · Gemini · OpenAI 파일마다 같은 사본이 있었다. 한 곳만 고치면
// provider 를 바꿨을 때 응답 언어나 난이도가 달라진다 —
// docs/18-ai-commentary-worker.md 가 경고한 갈라짐이 그대로 일어난다.

// 응답 언어. `Respond in ${...}.` 문장에 그대로 끼워 넣는다.
export const LOCALE_LANGUAGE: Record<SupportedLocale, string> = {
  [SupportedLocale.En]: "English",
  [SupportedLocale.Ko]: "Korean",
  [SupportedLocale.Ja]: "Japanese",
};

// 설명 수준별 독자 안내. 한 줄로 시스템 프롬프트에 붙는다.
export const LEVEL_GUIDANCE: Record<ExplanationLevel, string> = {
  [ExplanationLevel.Beginner]:
    "The reader is a beginner: briefly define any jargon you use in plain words.",
  [ExplanationLevel.Standard]: "The reader knows the basics of F1.",
  [ExplanationLevel.Expert]:
    "The reader is an expert: you may add one concise strategic nuance.",
};
