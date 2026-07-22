import { LiveRaceContextSummary } from "../LiveRaceContextSummary";

// 스냅샷의 결정론적 요약을 질문 컨텍스트 JSON 에 넣을 형태로 만든다 (docs/22 §B).
//
// **세 provider(Claude·Gemini·OpenAI)가 이 함수 하나를 호출한다.** 요약 주입을 세 곳에
// 각자 두면 A 단계에서 selectQuestionEvents 를 공용화한 것과 반대로 컨텍스트가 갈라진다.
// drivers·weather 선택은 provider 마다 의도적으로 다르지만, 요약은 이미 결정론적 집계라
// 한 형태로 통일해도 손해가 없다.
//
// 요약이 없으면(mock·replay·옛 스냅샷) null 을 준다 — 프롬프트에 "요약 없음"이 명시되어
// LLM 이 요약 필드를 지어내지 않게 한다.
export const toQuestionSummaryContext = (
  summary: LiveRaceContextSummary | undefined,
): LiveRaceContextSummary | null => summary ?? null;
