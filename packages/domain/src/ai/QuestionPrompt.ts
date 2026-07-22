import { RaceEvent } from "../RaceEvent";
import { LlmQuestionFocus } from "./RaceLlmProvider";

// Q&A 프롬프트의 포커스 조립 공용 로직 (docs/21-commentary-ask.md §질문 경로 확장).
//
// **세 provider(Claude·Gemini·OpenAI)가 반드시 이 함수를 거친다.** provider 안에서
// 따로 포커스를 붙이면 문구가 조용히 갈라지고, 그때부터 provider 를 바꾸는 것이 곧
// 품질 변화가 된다 — 해설 프롬프트가 buildCommentaryPrompt 로 단일화된 것과 같은 이유다
// (CommentaryPrompt.ts 주석 참고).
//
// 데이터 컨텍스트(drivers·weather 선택) 자체는 provider 마다 의도적으로 다르므로
// 각 provider 가 문자열로 만들어 dataContext 로 넘긴다. 여기서 통일하는 것은 포커스가
// 붙는 방식과 프롬프트 골격뿐이다.

// 완성된 질문 프롬프트. 전송 형식만 provider 마다 다르고, 여기까지는 세 provider 가 같다.
export type QuestionPrompt = {
  system: string;
  user: string;
};

// 포커스가 있을 때만 시스템 규칙에 붙는 한 줄. 이벤트와 시점 맥락 밖으로 나가면 환각이므로
// 그 범위를 벗어나면 모른다고 하도록 못 박는다.
const FOCUS_SYSTEM_RULE =
  "- This question is about a specific past event and its point-in-time context, both provided below. Answer ONLY within that event and its point-in-time context; if the answer lies outside them, say you do not know.";

// 프롬프트에 싣는 포커스 이벤트 요약. 원본 RaceEvent 에서 필요한 필드만 남긴다
// (type·driverNumber·lapNumber·timestamp·params).
const toFocusEventView = (
  event: RaceEvent,
): {
  type: string;
  driverNumber: number | null;
  lapNumber: number | null;
  timestamp: string;
  params: RaceEvent["params"];
} => ({
  type: event.type,
  driverNumber: event.driverNumber ?? null,
  lapNumber: event.lapNumber ?? null,
  timestamp: event.timestamp,
  params: event.params,
});

// 질문 프롬프트를 system·user 두 덩어리로 조립한다.
//
// **포커스가 없으면 기존과 바이트 단위로 동일하다** — 순수 추가이지 회귀가 아니다.
// systemLines 를 그대로 join 하고, user 는 기존 형식을 그대로 쓴다. 포커스가 있을 때만
// 규칙 한 줄과 포커스 JSON 이 덧붙는다.
export const buildQuestionPrompt = (params: {
  systemLines: string[];
  question: string;
  dataContext: string;
  focus?: LlmQuestionFocus;
}): QuestionPrompt => {
  const { systemLines, question, dataContext, focus } = params;

  const lines = [...systemLines];
  let user = `Question: ${question}\n\nCurrent race data (JSON):\n${dataContext}`;

  if (focus !== undefined) {
    lines.push(FOCUS_SYSTEM_RULE);

    const focusJson = JSON.stringify({
      event: toFocusEventView(focus.event),
      context: focus.context,
    });

    user += `\n\nFocus event and its point-in-time context (JSON):\n${focusJson}`;
  }

  return { system: lines.join("\n"), user };
};
