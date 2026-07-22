import { RaceEvent } from "../RaceEvent";
import { AiCommentary } from "./AiCommentary";
import { LlmQuestionFocus } from "./RaceLlmProvider";

// 해설 + 전체 이벤트 목록 → 그 해설에 대한 질문의 포커스(원본 이벤트 + 시점 맥락).
//
// 왜 순수 함수로 빼는가: 시트(UI)에서 조립하면 렌더 트리 안에 묻혀 단위 테스트가 어렵다.
// focus 를 어떤 조건에서 붙이고 언제 null 로 떨어뜨리는지가 환각 방지의 핵심이라(docs/21)
// 도메인에서 테스트 가능하게 둔다.
//
// null 을 돌려주는 두 경우 모두 "focus 없이 질문" 으로 처리한다:
//  1. pointInTimeContext 가 없다 — 옛 문서 · mock · replay 경로. 시점 순위를 모르므로
//     시점 맥락으로 좁혀 답할 수 없다. 현재 스냅샷 기준 일반 질문으로 내려간다.
//  2. 원본 이벤트를 찾지 못했다 — 이벤트가 목록에서 밀려났다. 포커스 이벤트가 없으면
//     focus 를 만들 수 없다.
export const buildLlmQuestionFocus = (
  commentary: AiCommentary,
  events: readonly RaceEvent[],
): LlmQuestionFocus | null => {
  const context = commentary.pointInTimeContext;

  if (context === undefined) {
    return null;
  }

  const event = events.find((item) => item.id === commentary.sourceEventId);

  if (event === undefined) {
    return null;
  }

  return { event, context };
};
