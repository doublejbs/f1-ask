import { RaceEventScope } from "../RaceEventScope";
import { buildCommentaryContext } from "./CommentaryContext";
import { LEVEL_GUIDANCE, LOCALE_LANGUAGE } from "./PromptGuidance";
import { LlmCommentaryRequest } from "./RaceLlmProvider";

// 해설 전용 시스템 규칙 (docs/18-ai-commentary-worker.md §프롬프트).
//
// Q&A(`SYSTEM_RULES`) 와 분리한 이유는 실측이다. Q&A 의 "모르면 모른다" 규칙이
// 해설에 섞이면 아무도 묻지 않았는데 "현재 데이터로 확인하기 어렵습니다" 같은
// 헤지 문장이 붙는다. 규칙을 분리하니 7/7 사라졌다.
// 이 파일의 문구는 Claude · Gemini · OpenAI provider 가 함께 쓴다 —
// 한쪽만 고치면 provider 교체 시 품질이 갈린다.
const COMMENTARY_ROLE =
  "You are an F1 commentator writing one-line captions for a second screen.";

// 범위별 임무. Driver 는 "왜 중요한지", Session 은 "무슨 일이 일어났는지" 다.
// Session 이벤트에 순위 맥락을 주면 연속 이벤트가 같은 선두 갭을 되풀이했다(실측 4/4).
const SCOPE_MISSION: Record<RaceEventScope, string> = {
  [RaceEventScope.Driver]:
    "- The reader already sees WHAT happened in the event feed. Your job is to add WHY it matters in this race right now.",
  [RaceEventScope.Session]:
    "- State exactly what happened in one precise sentence. Do not reach for consequences the data does not show.",
};

// 범위와 무관하게 항상 적용되는 규칙. 각 항목에 실측 근거가 있다.
const COMMENTARY_COMMON_RULES = [
  "- Use ONLY the data provided. Never invent numbers, positions, reasons, or probabilities.",
  "- If it is not in the data, it does not exist. Never mention flags, weather, tyres, or team decisions that are absent from the data.",
  "- Never mention the data, your sources, or your own uncertainty (no 'cannot be confirmed', no 'according to the data').",
  "- Refer to drivers ONLY by the three-letter code given in the data. Never use full names.",
  "- Exactly one sentence. In Korean, end with the declarative ending '다' and stay within 70 Korean characters; match that length in other languages.",
  "- Present tense. Factual and forceful, never speculative.",
];

// 이벤트 범위에 맞는 해설 시스템 규칙을 만든다.
export const buildCommentarySystemRules = (scope: RaceEventScope): string => {
  return [
    COMMENTARY_ROLE,
    "Rules you must follow:",
    SCOPE_MISSION[scope],
    ...COMMENTARY_COMMON_RULES,
  ].join("\n");
};

// 완성된 해설 프롬프트. 전송 형식(Gemini contents · Claude messages · OpenAI messages)
// 만 provider 마다 다르고, 여기까지는 세 provider 가 완전히 같다.
export type CommentaryPrompt = {
  system: string;
  user: string;
};

// 해설 요청 하나를 프롬프트 두 덩어리로 조립한다.
//
// **세 provider 가 반드시 이 함수를 거친다.** provider 안에서 따로 조립하면
// 문구가 조용히 갈라지고, 그때부터 provider 를 바꾸는 것이 곧 품질 변화가 된다
// (`ClaudeProvider` 의 baseUrl 무시 버그가 오래 방치됐던 것과 같은 종류의 사고다).
export const buildCommentaryPrompt = (
  request: LlmCommentaryRequest,
): CommentaryPrompt => {
  // 해설은 Q&A 와 규칙을 공유하지 않는다 (이 파일 위쪽 주석 참고).
  const context = buildCommentaryContext(
    request.event,
    request.snapshot,
    request.recentCommentary,
  );

  const system = [
    buildCommentarySystemRules(context.scope),
    `Respond in ${LOCALE_LANGUAGE[request.locale]}.`,
    LEVEL_GUIDANCE[request.explanationLevel],
    "Reply with only the sentence.",
  ].join("\n");

  const user = `Event context (JSON):\n${JSON.stringify(context)}`;

  return { system, user };
};
