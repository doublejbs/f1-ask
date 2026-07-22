import { RaceEventScope } from "../RaceEventScope";
import { RaceEventType } from "../RaceEventType";
import { buildCommentaryContext, CommentaryContext } from "./CommentaryContext";
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
  "- Use ONLY the data provided. Never invent numbers, positions, or probabilities.",
  "- If it is not in the data, it does not exist. Never mention flags, weather, tyres, or team decisions that are absent from the data.",
  "- Never mention the data, your sources, or your own uncertainty (no 'cannot be confirmed', no 'according to the data').",
  "- Refer to drivers ONLY by the three-letter code given in the data. Never use full names.",
  "- Exactly one sentence. In Korean, end with the declarative ending '다' and stay within 70 Korean characters; match that length in other languages.",
  "- Present tense. Factual and forceful, never speculative.",
];

// 타이어 전략(strategy_note) 전용 지침.
//
// 실측(벨기에 GP 29건 중 12건)에서 이 타입이 "누구는 다른 타이어로 반등을 노린다" 로
// 획일화됐다. 원인은 공통 규칙의 "reasons 를 지어내지 말라" 가 타이어 특성 설명까지
// 막아, 모델이 compound 를 이름만 대고 의미를 회피했기 때문이다.
//
// 타이어 특성(소프트=그립·고마모, 하드=내구·저그립, 미디엄=중간)은 지어낸 수치가
// 아니라 F1 의 물리적 상식이다. 이것과 데이터에 있는 남은 랩·순위를 곱하면 "왜 이
// compound 인가" 가 근거 있는 추론으로 나온다 — 하드 + 남은 랩 많음 = 끝까지 가는
// 롱런, 소프트 + 남은 랩 적음 = 막판 페이스 승부. 단 랩 수·순위·간격 같은 구체값은
// 여전히 데이터에 있는 것만 쓴다.
const STRATEGY_NOTE_GUIDANCE = [
  "For a tyre strategy event, name the INTENT behind THIS compound, not just that it differs from the field.",
  "Read the intent from tyre physics (soft = grip, high wear; hard = durable, low grip; medium = balance) plus laps remaining and track position: hard with many laps left = a long run to the flag; soft late = a final-stint pace attack.",
  "Do NOT recite the tyre's properties in the sentence; state the tactical consequence only. Two drivers on the same compound must read differently — differentiate by their position, gap, or laps remaining, never with the same phrase.",
  "Stay within the one-sentence length limit; if the reasoning does not fit, keep the consequence and drop the explanation.",
].join(" ");

// 조사(investigation) 전용 지침.
//
// 실측(벨기에 GP)에서 같은 사건의 접수/종료 두 이벤트가 같은 문장으로 나왔다. 원인은
// params.status(noted / under_investigation / concluded)를 프롬프트가 활용하라고
// 지시하지 않아, 모델이 상태를 무시하고 같은 요지를 반복했기 때문이다. status 는
// 지어낸 값이 아니라 레이스 컨트롤이 통보한 사실이므로 그대로 반영한다.
const INVESTIGATION_GUIDANCE = [
  "Anchor the sentence to params.status: 'noted' = stewards have just logged the incident (no verdict yet); 'under_investigation' = an active probe is running; 'concluded' = the review is over and the outcome now stands.",
  "A 'noted'/'under_investigation' event opens a threat; a 'concluded' event resolves it. Never write the same sentence for the opening and the conclusion of one incident.",
].join(" ");

// 추월 예측(overtake_forecast) 전용 지침.
//
// 예측의 본체는 결정론 나눗셈이다(docs/23 §원칙: 예측은 산수다). 잡는 속도·예상 랩은 params 에
// 이미 계산돼 있으므로 모델이 새 숫자를 지어내면 안 된다. LLM 의 자리는 "왜 잡히는가" —
// 양쪽 compound·tireAgeLaps 차이로 추세를 설명하는 것이다. 예측 랩은 확정이 아니라 추세이므로
// 단정("N랩째 추월한다")하지 말고 흐름("이 추세면 N랩 안에 사정권")으로 말하게 한다.
const OVERTAKE_FORECAST_GUIDANCE = [
  "This is a forecast, not a fact: the closing rate and predicted lap in params are deterministic math. Speak of the predicted lap as a TREND ('on this pace, within N laps'), never as a settled outcome ('will pass on lap N').",
  "Ground the WHY in the two cars' tyre difference — compare their compound and tireAgeLaps to explain why the chaser is reeling the leader in (fresher rubber, softer compound, less wear).",
  "Use ONLY the numbers already in params (closing rate, laps to battle, predicted lap); never invent a pace, gap, or lap of your own.",
].join(" ");

// 이벤트 타입별 전용 지침. 없으면 undefined.
const EVENT_TYPE_GUIDANCE: Partial<Record<RaceEventType, string>> = {
  [RaceEventType.StrategyNote]: STRATEGY_NOTE_GUIDANCE,
  [RaceEventType.Investigation]: INVESTIGATION_GUIDANCE,
  [RaceEventType.OvertakeForecast]: OVERTAKE_FORECAST_GUIDANCE,
};

// 이벤트 범위에 맞는 해설 시스템 규칙을 만든다.
// 타입별 전용 지침이 있으면 덧붙인다 (타이어 전략의 compound 의도, 조사의 접수/종료 구분 등).
export const buildCommentarySystemRules = (
  scope: RaceEventScope,
  eventType?: RaceEventType,
): string => {
  const rules = [
    COMMENTARY_ROLE,
    "Rules you must follow:",
    SCOPE_MISSION[scope],
    ...COMMENTARY_COMMON_RULES,
  ];

  const typeGuidance =
    eventType === undefined ? undefined : EVENT_TYPE_GUIDANCE[eventType];

  if (typeGuidance !== undefined) {
    rules.push(typeGuidance);
  }

  return rules.join("\n");
};

// 완성된 해설 프롬프트. 전송 형식(Gemini contents · Claude messages · OpenAI messages)
// 만 provider 마다 다르고, 여기까지는 세 provider 가 완전히 같다.
export type CommentaryPrompt = {
  system: string;
  user: string;
  // 프롬프트에 실제로 직렬화해 넣은 시점 맥락. provider 가 저장 경로로 그대로 실어 보낸다.
  // 저장용으로 다시 만들지 않는 이유는 "해설이 본 것 == 저장한 것" 을 한 객체로 보장하기
  // 위해서다 — 두 번 만들면 스냅샷·러닝 컨텍스트가 미묘하게 어긋날 수 있다
  // (docs/21-commentary-ask.md §시점 맥락을 해설 문서에 저장한다).
  context: CommentaryContext;
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
    buildCommentarySystemRules(context.scope, request.event.type),
    `Respond in ${LOCALE_LANGUAGE[request.locale]}.`,
    LEVEL_GUIDANCE[request.explanationLevel],
    "Reply with only the sentence.",
  ].join("\n");

  const user = `Event context (JSON):\n${JSON.stringify(context)}`;

  return { system, user, context };
};
