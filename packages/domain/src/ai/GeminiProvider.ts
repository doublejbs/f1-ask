import { LiveDriverState } from "../LiveDriverState";
import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { RaceEvent } from "../RaceEvent";
import { RaceSummaryData } from "../RaceSummary";
import { SupportedLocale } from "../SupportedLocale";
import { AiConfidence } from "./AiConfidence";
import { buildCommentaryPrompt } from "./CommentaryPrompt";
import { GeminiChatRole } from "./GeminiChatRole";
import { LlmChatRole } from "./LlmChatRole";
import { buildQuestionPrompt } from "./QuestionPrompt";
import { selectQuestionEvents } from "./QuestionEventSelection";
import { toQuestionSummaryContext } from "./QuestionSummaryContext";
import {
  LOOKUP_F1_KNOWLEDGE_TOOL_NAME,
  QUESTION_TOOL_DEFINITIONS,
  QuestionToolDefinition,
  QuestionToolExecutor,
  ToolParameterSchema,
} from "./QuestionTools";
import {
  LLM_REQUEST_TIMEOUT_MS,
  withLlmRequestTimeout,
} from "./LlmRequestTimeout";
import { LEVEL_GUIDANCE, LOCALE_LANGUAGE } from "./PromptGuidance";
import {
  LlmAnswer,
  LlmCommentary,
  LlmCommentaryRequest,
  LlmQuestionRequest,
  LlmSummary,
  LlmSummaryRequest,
  RaceLlmProvider,
} from "./RaceLlmProvider";

// 모델이 낸 함수 호출 (응답 part 의 functionCall, 그리고 되돌려 실을 때의 값).
type GeminiFunctionCall = { name: string; args: Record<string, unknown> };

// Gemini 요청 본문의 한 발화 part. 텍스트 / 함수호출 / 함수응답 셋 중 하나다.
// (기존은 text part 만이었다 — 툴 루프를 위해 functionCall·functionResponse 를 더한다.)
type GeminiPart =
  | { text: string }
  | { functionCall: GeminiFunctionCall }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

// Gemini 요청 본문의 한 발화 (contents[]).
type GeminiContent = {
  role: GeminiChatRole;
  parts: GeminiPart[];
};

// Gemini functionDeclarations wire 형태. 공용 툴 정의를 이 구조로 변환해 요청에 싣는다.
type GeminiToolDeclaration = {
  functionDeclarations: {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
  }[];
};

// generate 저수준 호출의 결과. text 조각과 functionCall 을 모두 노출한다
// (기존 generate 는 functionCall part 를 버렸다 — 툴 루프가 이를 봐야 한다).
type GeminiGeneration = {
  text: string;
  functionCalls: GeminiFunctionCall[];
};

// 주입 가능한 fetch (네트워크 없이 단위 테스트).
export type GeminiFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

// 요청별 툴 executor 를 만드는 팩토리 (docs/26 §서버측 Firestore).
//
// 왜 정적 executor 가 아니라 팩토리인가: provider 는 캐시되어 프로세스 수명 내내 한 번만
// 만들어지지만, 툴이 읽어야 할 전체 이력은 요청의 snapshot.sessionId 마다 다르다. executor 를
// 생성자에 고정하면 모든 요청이 같은 이력을 보게 된다 — 팩토리를 받아 요청마다 그 요청의
// sessionId 로 executor 를 만든다. 팩토리 자체는 정적(캐시 provider 유지)이다.
export type QuestionToolExecutorFactory = (
  request: LlmQuestionRequest,
) => QuestionToolExecutor;

export type GeminiProviderOptions = {
  apiKey: string;
  model?: string;
  fetchImpl?: GeminiFetch;
  baseUrl?: string;
  // 요청 1회의 상한. 기본값은 워커의 해설 예산과 같은 출처다(LlmRequestTimeout.ts).
  timeoutMs?: number;
  // 주입되면 answerQuestion 이 요청마다 executor 를 만들어 툴 루프를 돈다(모델이 전체 이력을
  // 조회). 미주입이면 기존과 동일한 단발 동작이다 — tools 를 요청에 싣지 않는다(docs/26 §라우터).
  toolExecutorFactory?: QuestionToolExecutorFactory;
};

// 현행 Flash 계열 모델. 해설/답변은 1~2문장으로 짧아 Flash 급으로 충분하다.
// 되돌리지 말 것: 이전 기본값이던 gemini-2.5-flash 는 ListModels 에는 계속 보이지만
// generateContent 는 신규 사용자에게 닫혀 404 ("no longer available to new users") 를 반환한다.
export const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash";
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
// Gemini 3.x 는 사고(thinking)가 기본 활성이고 사고 토큰이 maxOutputTokens 예산을 함께 잠식한다.
// (실측: 사고 설정 없이 예산 200 → thoughtsTokenCount 188, 본문은 "\n" 1토큰.
//  thinkingLevel "low" + 예산 120 → 사고 115, finishReason MAX_TOKENS, 본문 없음.)
// 이 provider 는 1~2문장만 생성하므로 사고가 필요 없다 — 꺼야 현재 예산(300/120/200)으로 본문이 나온다.
const THINKING_BUDGET_DISABLED = 0;
const CONTEXT_DRIVER_LIMIT = 20;

// 툴 루프 종료 상한 (docs/26 운영 경계 D1). 모델의 자발적 중단만 믿으면 툴→툴→툴 무한
// 반복으로 비용·지연이 무계다. 이 라운드 수만큼 툴 호출을 허용하고, 넘으면 tools 없이
// 1회 더 호출해 강제로 최종 답변을 받는다 — 무한 루프를 구조적으로 막는다.
const MAX_TOOL_ROUNDS = 3;

// 라우터 오발동 억제 (docs/26 §라우터 "항상 열기"). 툴은 열어두되, 이미 컨텍스트에 실린
// 스냅샷·이벤트로 답할 수 있으면 툴을 쓰지 말라고 못 박는다 — 단순 질문이 1콜에서
// 2콜 왕복으로 비싸지는 오발동을 막는 것이 이 방식의 핵심 리스크다.
const TOOL_USAGE_RULE =
  "- You have tools to query the full race history and to look up curated rules and circuit knowledge. Do NOT call a tool when the snapshot and events already in the context are enough to answer; only call a tool for facts that are missing from the context (for example an early pit lap that is no longer in the recent events).";

// 지식 툴의 신뢰 경계 (docs/26 R5·수용 기준 6). 규정·서킷은 결정론이 지켜주지 않으므로
// **큐레이션 결과만 인용**하게 못 박는다. 모델이 자기 기억으로 규정을 말하면 검증된 지식
// 파일을 둔 의미가 사라지고, 틀린 규정이 "지식"으로 세탁된다.
//
// 툴 이름은 상수에서 조립한다 — 리터럴로 박아 두면 QuestionTools 에서 이름을 바꿨을 때
// 프롬프트만 옛 이름을 가리켜 모델이 존재하지 않는 툴을 부른다.
const KNOWLEDGE_TOOL_RULE = `- For questions about rules, regulations or circuit characteristics, use ${LOOKUP_F1_KNOWLEDGE_TOOL_NAME} and cite ONLY what it returns. Never state a rule or a circuit fact from your own memory, and if the lookup returns nothing, say you do not know.`;

// AI 규칙 (PRD §14) 을 프롬프트로 인코딩한다. ClaudeProvider 와 동일한 문구를 유지한다.
const SYSTEM_RULES = [
  "You are a reliable Formula 1 race engineer explaining live timing data on a second screen.",
  "Rules you must follow:",
  "- Use ONLY the data provided in the context. Never invent numbers, positions, or probabilities.",
  "- Team strategy (pit calls, undercut) is an estimate — say it cannot be confirmed from the data.",
  "- If the data is insufficient to answer, say you do not know.",
  "- Be concise: 1-2 short sentences.",
].join("\n");

type DriverContext = {
  n: number;
  code: string;
  team: string;
  pos: number | null;
  startPos: number | null;
  posChange: number | null;
  gapToLeader: number | null;
  interval: number | null;
  tire: string;
  tireAgeLaps: number | null;
  pits: number;
  lastLap: number | null;
  sectors: (number | null)[] | null;
  topSpeedKph: number | null;
  inPit: boolean;
  retired: boolean;
};

const toDriverContext = (driver: LiveDriverState): DriverContext => ({
  n: driver.driverNumber,
  code: driver.code,
  team: driver.teamName,
  pos: driver.position,
  startPos: driver.startingPosition,
  posChange: driver.positionChange,
  gapToLeader: driver.gapToLeaderSeconds,
  interval: driver.intervalToAheadSeconds,
  tire: driver.compound,
  tireAgeLaps: driver.tireAgeLaps,
  pits: driver.pitStopCount,
  lastLap: driver.lastLapSeconds,
  sectors: driver.lastSectorsSeconds ?? null,
  topSpeedKph: driver.topSpeedKph ?? null,
  inPit: driver.inPit,
  retired: driver.retired,
});

// 질문 관련 데이터만 선택해 context 를 구성한다 (docs §42.2).
const buildQuestionContext = (
  snapshot: LiveRaceSnapshot,
  recentEvents: RaceEvent[],
  favoriteDriverNumbers: number[],
): string => {
  const drivers = snapshot.drivers
    .slice(0, CONTEXT_DRIVER_LIMIT)
    .map(toDriverContext);
  // 시간순 자르기가 아니라 우선순위·타입 선별(도메인 순수 함수)로 이벤트를 고른다.
  // 세 provider 가 같은 함수를 쓰므로 컨텍스트가 갈라지지 않는다 (QuestionEventSelection.ts).
  const events = selectQuestionEvents(recentEvents).map((event) => ({
    type: event.type,
    driverNumber: event.driverNumber ?? null,
    params: event.params,
  }));
  const weather =
    snapshot.weather === undefined
      ? null
      : {
          airTempC: snapshot.weather.airTemperatureCelsius,
          trackTempC: snapshot.weather.trackTemperatureCelsius,
          humidityPct: snapshot.weather.humidityPercent,
          rainfall: snapshot.weather.rainfall,
          windMps: snapshot.weather.windSpeedMps ?? null,
        };

  return JSON.stringify({
    session: {
      name: snapshot.sessionName,
      circuit: snapshot.circuitName,
      status: snapshot.status,
      currentLap: snapshot.currentLap,
      totalLaps: snapshot.totalLaps,
    },
    weather,
    favoriteDriverNumbers,
    // 드라이버별: 순위/시작순위/순위변동/간격/타이어/최근랩/섹터[S1,S2,S3]/스피드트랩/피트.
    drivers,
    recentEvents: events,
    // 워커가 원본에서 계산한 결정론적 요약(피트·스틴트·추월). 세 provider 공용 함수로 넣는다.
    summary: toQuestionSummaryContext(snapshot.contextSummary),
  });
};

// 환경변수로 주입된 모델 값을 정규화한다.
// GEMINI_MODEL 에 "models/gemini-2.5-flash" 처럼 접두사가 붙어 오면
// URL 이 /models/models/... 가 되어 404 가 난다 — 맨 앞의 "models/" 한 번만 제거한다.
const normalizeModel = (model: string): string => {
  const trimmed = model.trim();

  return trimmed.replace(/^models\//, "");
};

// baseUrl 의 후행 슬래시를 제거한다 (".../v1beta/" 가 "//models" 를 만들지 않도록).
const normalizeBaseUrl = (baseUrl: string): string => {
  return baseUrl.trim().replace(/\/+$/, "");
};

// 오류 응답 본문에서 Google 의 에러 메시지를 뽑아낸다.
// 본문이 JSON 이 아니거나 읽기 자체가 실패할 수 있으므로 절대 throw 하지 않는다.
const readErrorMessage = async (response: {
  json: () => Promise<unknown>;
}): Promise<string | null> => {
  try {
    const body = (await response.json()) as {
      error?: { message?: unknown; status?: unknown };
    };
    const message = body?.error?.message;

    if (typeof message !== "string" || message.length === 0) {
      return null;
    }

    const status = body?.error?.status;

    if (typeof status === "string" && status.length > 0) {
      return `${status}: ${message}`;
    }

    return message;
  } catch {
    return null;
  }
};

const parseConfidence = (value: unknown): AiConfidence => {
  if (value === AiConfidence.High || value === AiConfidence.Low) {
    return value;
  }

  return AiConfidence.Medium;
};

// 내부 role → Gemini wire role 매핑 (assistant 는 Gemini 에서 "model").
const toGeminiRole = (role: LlmChatRole): GeminiChatRole => {
  if (role === LlmChatRole.Assistant) {
    return GeminiChatRole.Model;
  }

  return GeminiChatRole.User;
};

// 공용 툴 정의 → Gemini functionDeclarations. 스키마(type object/properties/required)는
// 이미 JSON-schema 형태라 그대로 싣는다 — provider 는 wire 변환만 하고 스키마는 손대지 않는다.
const toGeminiTool = (
  definitions: QuestionToolDefinition[],
): GeminiToolDeclaration => ({
  functionDeclarations: definitions.map((definition) => ({
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
  })),
});

// 모델이 준 args 는 임의 값이다 — object 가 아니면 빈 인자로 안전 처리한다.
const toArgs = (value: unknown): Record<string, unknown> => {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
};

// functionResponse.response 는 JSON object(struct)여야 한다 (REST 규격). executor 가
// 배열(queryDriverEvents 결과)이나 원시값을 주면 { result } 로 감싸 규격을 지킨다.
const toResponseObject = (value: unknown): Record<string, unknown> => {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return { result: value };
};

const SUGGESTED_QUESTIONS: Record<SupportedLocale, string[]> = {
  [SupportedLocale.En]: [
    "Who is leading now?",
    "How is the leader's pace?",
    "Is anyone in the pits?",
  ],
  [SupportedLocale.Ko]: [
    "지금 누가 선두야?",
    "선두 페이스 어때?",
    "지금 피트인한 드라이버 있어?",
  ],
  [SupportedLocale.Ja]: [
    "今は誰が首位？",
    "首位のペースは？",
    "ピットインした人は？",
  ],
};

// 실제 Google Gemini provider. RaceLlmProvider 인터페이스를 구현하며 서버에서만 사용한다.
// (API 키는 클라이언트 번들에 포함하지 않는다.)
// 프롬프트·컨텍스트·응답 계약은 ClaudeProvider 와 동일하게 유지한다 — 모델만 다르다.
export class GeminiProvider implements RaceLlmProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: GeminiFetch;
  private readonly timeoutMs: number;
  private readonly toolExecutorFactory?: QuestionToolExecutorFactory;

  constructor(options: GeminiProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = normalizeModel(options.model ?? GEMINI_DEFAULT_MODEL);
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.fetchImpl =
      options.fetchImpl ??
      ((url, init) => fetch(url, init) as unknown as ReturnType<GeminiFetch>);
    this.timeoutMs = options.timeoutMs ?? LLM_REQUEST_TIMEOUT_MS;
    this.toolExecutorFactory = options.toolExecutorFactory;
  }

  async answerQuestion(request: LlmQuestionRequest): Promise<LlmAnswer> {
    const context = buildQuestionContext(
      request.snapshot,
      request.recentEvents,
      request.favoriteDriverNumbers,
    );

    // 툴은 팩토리가 주입됐을 때만 연다(docs/26 §라우터). executor 는 이 요청의 sessionId 로
    // 만들어진다 — 팩토리가 lazy·memoize 하면 라우터가 "툴 안 씀"으로 답할 때 Firestore 읽기 0.
    // 열 때만 오발동 억제 규칙을 시스템 프롬프트에 더한다 — 미주입 경로의 프롬프트는 기존과
    // 바이트 동일하게 유지한다.
    const executor = this.toolExecutorFactory?.(request);
    const toolsEnabled = executor !== undefined;

    // 골격·포커스 조립은 세 provider 공용이다. 여기서 따로 만들면 문구가 갈라진다
    // (QuestionPrompt.ts 주석 참고). 포커스가 없으면 결과는 기존과 바이트 동일하다.
    const { system, user } = buildQuestionPrompt({
      systemLines: [
        SYSTEM_RULES,
        `Respond in ${LOCALE_LANGUAGE[request.locale]}.`,
        LEVEL_GUIDANCE[request.explanationLevel],
        ...(toolsEnabled ? [TOOL_USAGE_RULE, KNOWLEDGE_TOOL_RULE] : []),
        'Reply with ONLY a JSON object (no markdown, no prose around it): {"answer": string, "confidence": "low"|"medium"|"high", "insufficientData": boolean, "referencedDriverNumbers": number[]}.',
      ],
      question: request.question,
      dataContext: context,
      focus: request.focus,
    });

    // 이전 대화 턴(원문 텍스트) + 현재 질문(데이터 첨부)으로 contents 를 구성한다.
    // 데이터는 매 턴 바뀌므로 현재 질문에만 첨부하고, 히스토리는 Q&A 텍스트만 담는다.
    const contents: GeminiContent[] = [
      ...(request.conversationHistory ?? []).map((turn) => ({
        role: toGeminiRole(turn.role),
        parts: [{ text: turn.content }],
      })),
      { role: GeminiChatRole.User, parts: [{ text: user }] },
    ];

    // 툴 미주입이면 기존 단발 경로 그대로. 주입되면 이 요청의 executor 로 툴 루프를 돈다.
    const content =
      executor === undefined
        ? await this.generate(system, contents, 300)
        : await this.runToolLoop(system, contents, executor);

    return this.toAnswer(content, request);
  }

  // 최종 텍스트(JSON) → LlmAnswer. 단발 경로와 툴 루프 경로가 같은 파서를 쓴다.
  private toAnswer(content: string, request: LlmQuestionRequest): LlmAnswer {
    const parsed = this.safeJson(content);

    const answer =
      typeof parsed?.answer === "string" && parsed.answer.length > 0
        ? parsed.answer
        : content.trim();

    return {
      answer,
      confidence: parseConfidence(parsed?.confidence),
      insufficientData: parsed?.insufficientData === true,
      dataTimestamp: request.snapshot.sourceUpdatedAt,
      snapshotVersion: request.snapshot.version,
      referencedDriverNumbers: this.numberArray(parsed?.referencedDriverNumbers),
      referencedEventIds: [],
      suggestedQuestions: SUGGESTED_QUESTIONS[request.locale],
    };
  }

  // 툴 루프 (docs/26 §툴 호출 추상화). 툴 상태는 이 호출 안에서만 산다(D3 질문 독립) —
  // conversation 은 로컬 복제본이라 크로스턴 이월이 없다.
  //
  // 주의: 이 루프는 최악의 경우 (MAX_TOOL_ROUNDS + 1) 회 호출 = 4 × timeoutMs 까지
  // 소요될 수 있다(D2). 각 라운드는 timeoutMs 예산을 새로 잡으므로, 호출자(/api/ask)가
  // 이 최대 지연을 감내해야 한다. 예: MAX_TOOL_ROUNDS=3 × 12s=36s + 최종 12s = 최악 48s.
  private async runToolLoop(
    system: string,
    contents: GeminiContent[],
    executor: QuestionToolExecutor,
  ): Promise<string> {
    const tools = [toGeminiTool(QUESTION_TOOL_DEFINITIONS)];
    const conversation: GeminiContent[] = [...contents];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const { text, functionCalls } = await this.generateWithTools(
        system,
        conversation,
        300,
        tools,
      );

      // 툴 호출이 없으면 그대로 최종 답변이다.
      if (functionCalls.length === 0) {
        if (text.length === 0) {
          throw new Error("Gemini response has no text part");
        }

        return text;
      }

      // Gemini 는 functionCall 발화와 functionResponse 발화가 짝을 이뤄야 한다 —
      // 모델의 호출을 model 롤로 먼저 남기고, 실행 결과를 user 롤(REST 규격)로 되돌린다.
      conversation.push({
        role: GeminiChatRole.Model,
        parts: functionCalls.map((call) => ({ functionCall: call })),
      });

      // 왜: executor 가 네트워크 오류 등으로 reject 하면 Promise.all 이 죽어 전체
      // 루프가 중단된다. 각 호출을 독립적으로 try/catch 해 **에러를 functionResponse
      // 페이로드**로 되돌려야 한다 — 그러면 모델이 "그 데이터는 못 가져왔다"로
      // 이어갈 수 있고, 답변 생성이 계속된다. 후속 Firestore executor 도 이를 기대한다.
      const responseParts = await Promise.all(
        functionCalls.map(async (call) => {
          try {
            const result = await executor(call.name, call.args);

            return {
              functionResponse: {
                name: call.name,
                response: toResponseObject(result),
              },
            };
          } catch (error) {
            // 에러를 에러 페이로드로 되돌린다. 모델이 처리할 수 있는 구조.
            const message =
              error instanceof Error ? error.message : String(error);

            return {
              functionResponse: {
                name: call.name,
                response: { error: message },
              },
            };
          }
        }),
      );

      conversation.push({ role: GeminiChatRole.User, parts: responseParts });
    }

    // 라운드 캡 초과 (D1): tools 를 빼고 1회 더 호출해 강제로 최종 텍스트를 받는다.
    // 툴을 못 쓰게 하니 모델은 그때까지 모은 tool-result 만으로 답할 수밖에 없다.
    const { text } = await this.generateWithTools(system, conversation, 300);

    if (text.length === 0) {
      throw new Error("Gemini response has no text part");
    }

    return text;
  }

  async generateCommentary(
    request: LlmCommentaryRequest,
  ): Promise<LlmCommentary> {
    // 조립은 세 provider 공용이다. 여기서 따로 만들면 문구가 갈라진다
    // (CommentaryPrompt.ts 주석 참고).
    const { system, user, context } = buildCommentaryPrompt(request);

    const text = await this.generate(
      system,
      [{ role: GeminiChatRole.User, parts: [{ text: user }] }],
      120,
    );

    // 프롬프트에 넣은 맥락을 그대로 실어 보낸다. 워커가 저장 시 재계산하지 않는다.
    return {
      sourceEventId: request.event.id,
      text: text.trim(),
      pointInTimeContext: context,
    };
  }

  async generateSummary(request: LlmSummaryRequest): Promise<LlmSummary> {
    const codeOf = (driverNumber: number | null): string => {
      if (driverNumber === null) {
        return "unknown";
      }

      return (
        request.snapshot.drivers.find((d) => d.driverNumber === driverNumber)
          ?.code ?? "unknown"
      );
    };

    const facts: RaceSummaryData = request.summary;
    const system = [
      SYSTEM_RULES,
      `Respond in ${LOCALE_LANGUAGE[request.locale]}.`,
      "Write a short post-session recap (2-3 sentences) using only these facts. Reply with only the recap.",
    ].join("\n");

    const user = JSON.stringify({
      session: facts.sessionName,
      winner: codeOf(facts.winnerDriverNumber),
      podium: facts.podiumDriverNumbers.map(codeOf),
      fastestLap: codeOf(facts.fastestLapDriverNumber),
      totalOvertakes: facts.totalOvertakes,
      totalPitStops: facts.totalPitStops,
      retirements: facts.retiredDriverNumbers.length,
    });

    const text = await this.generate(
      system,
      [{ role: GeminiChatRole.User, parts: [{ text: user }] }],
      200,
    );

    return { text: text.trim() };
  }

  // 텍스트만 필요한 경로(요약·해설·툴 미사용 질문)의 얇은 래퍼.
  // 저수준 호출과 달리 "텍스트가 없으면 오류"를 여기서 강제한다 — 기존 동작을 그대로 보존한다.
  private async generate(
    system: string,
    contents: GeminiContent[],
    maxOutputTokens: number,
  ): Promise<string> {
    const { text } = await this.generateWithTools(
      system,
      contents,
      maxOutputTokens,
    );

    if (text.length === 0) {
      throw new Error("Gemini response has no text part");
    }

    return text;
  }

  // Google Generative Language API 의 generateContent 저수준 호출.
  // system 은 systemInstruction 으로, 대화는 contents[] 로 전달한다.
  // API 키는 URL query 대신 헤더로 보내 로그에 남지 않도록 한다.
  //
  // 기존 generate 와 두 가지가 다르다:
  //   (1) tools 를 선택적으로 싣는다 — 미전달이면 body 에 tools 키가 없어 요청이 기존과
  //       바이트 동일하다(요약·해설·툴 미사용 질문 경로 불변).
  //   (2) text 뿐 아니라 functionCall part 도 노출한다 — 기존은 functionCall 을 버렸다.
  //       "텍스트 없으면 오류"는 여기서 던지지 않는다(functionCall-only 응답이 정상이므로).
  private async generateWithTools(
    system: string,
    contents: GeminiContent[],
    maxOutputTokens: number,
    tools?: GeminiToolDeclaration[],
  ): Promise<GeminiGeneration> {
    const body = {
      contents,
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens,
        // 사고를 끈다 — 켜두면 사고 토큰이 예산을 다 써 본문이 비어 나온다 (상수 주석 참고).
        thinkingConfig: { thinkingBudget: THINKING_BUDGET_DISABLED },
      },
      // tools 미전달이면 키 자체를 넣지 않는다 — 기존 요청 본문과 바이트 동일하게 유지한다.
      ...(tools === undefined ? {} : { tools }),
    };
    // 모델은 REST 경로 파라미터(models/{model})로만 전달한다.
    // GenerateContentRequest 본문에는 model 필드가 없어 넣으면 400 이 난다.

    // 응답 본문 읽기까지 한 덩어리로 타임아웃에 넣는다. 헤더만 온 뒤 본문이 멈춰도
    // 예산을 넘기면 안 되기 때문이다. 툴 루프는 라운드마다 이 예산을 새로 잡는다(D2).
    const requestOnce = async (
      signal: AbortSignal,
    ): Promise<GeminiGeneration> => {
      const response = await this.fetchImpl(
        `${this.baseUrl}/models/${this.model}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify(body),
          signal,
        },
      );

      if (!response.ok) {
        // 진단에 필요한 것은 상태 코드·모델 이름·Google 이 준 사유다.
        // API 키가 새지 않도록 전체 URL 은 넣지 않고 모델 이름만 남긴다.
        const detail = await readErrorMessage(response);
        const suffix = detail === null ? "" : ` - ${detail}`;

        throw new Error(
          `Gemini request failed: ${response.status} (model: ${this.model})${suffix}`,
        );
      }

      const data = (await response.json()) as {
        candidates?: {
          content?: {
            parts?: {
              text?: string;
              functionCall?: { name?: string; args?: unknown };
            }[];
          };
        }[];
      };

      const candidate = data.candidates?.[0];

      if (candidate === undefined) {
        throw new Error("Gemini response has no candidates");
      }

      const parts = candidate.content?.parts;

      if (!Array.isArray(parts)) {
        throw new Error("Gemini candidate has no content parts");
      }

      // parts[] 의 text 조각을 합친다.
      const text = parts
        .filter(
          (part): part is { text: string } => typeof part.text === "string",
        )
        .map((part) => part.text)
        .join("");

      // functionCall part 를 뽑아 노출한다(이름이 문자열인 것만).
      const functionCalls: GeminiFunctionCall[] = parts
        .filter(
          (part): part is { functionCall: { name: string; args?: unknown } } =>
            part.functionCall !== undefined &&
            typeof part.functionCall.name === "string",
        )
        .map((part) => ({
          name: part.functionCall.name,
          args: toArgs(part.functionCall.args),
        }));

      return { text, functionCalls };
    };

    return withLlmRequestTimeout(requestOnce, {
      timeoutMs: this.timeoutMs,
      label: `Gemini (model: ${this.model})`,
    });
  }

  private safeJson(
    content: string,
  ): {
    answer?: unknown;
    confidence?: unknown;
    insufficientData?: unknown;
    referencedDriverNumbers?: unknown;
  } | null {
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private numberArray(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is number => typeof item === "number");
  }
}
