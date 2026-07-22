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

// Gemini 요청 본문의 한 발화 (contents[]).
type GeminiContent = {
  role: GeminiChatRole;
  parts: { text: string }[];
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

export type GeminiProviderOptions = {
  apiKey: string;
  model?: string;
  fetchImpl?: GeminiFetch;
  baseUrl?: string;
  // 요청 1회의 상한. 기본값은 워커의 해설 예산과 같은 출처다(LlmRequestTimeout.ts).
  timeoutMs?: number;
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

  constructor(options: GeminiProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = normalizeModel(options.model ?? GEMINI_DEFAULT_MODEL);
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.fetchImpl =
      options.fetchImpl ??
      ((url, init) => fetch(url, init) as unknown as ReturnType<GeminiFetch>);
    this.timeoutMs = options.timeoutMs ?? LLM_REQUEST_TIMEOUT_MS;
  }

  async answerQuestion(request: LlmQuestionRequest): Promise<LlmAnswer> {
    const context = buildQuestionContext(
      request.snapshot,
      request.recentEvents,
      request.favoriteDriverNumbers,
    );

    // 골격·포커스 조립은 세 provider 공용이다. 여기서 따로 만들면 문구가 갈라진다
    // (QuestionPrompt.ts 주석 참고). 포커스가 없으면 결과는 기존과 바이트 동일하다.
    const { system, user } = buildQuestionPrompt({
      systemLines: [
        SYSTEM_RULES,
        `Respond in ${LOCALE_LANGUAGE[request.locale]}.`,
        LEVEL_GUIDANCE[request.explanationLevel],
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

    const content = await this.generate(system, contents, 300);
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

  // Google Generative Language API 의 generateContent 호출.
  // system 은 systemInstruction 으로, 대화는 contents[] 로 전달한다.
  // API 키는 URL query 대신 헤더로 보내 로그에 남지 않도록 한다.
  private async generate(
    system: string,
    contents: GeminiContent[],
    maxOutputTokens: number,
  ): Promise<string> {
    const body = {
      contents,
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens,
        // 사고를 끈다 — 켜두면 사고 토큰이 예산을 다 써 본문이 비어 나온다 (상수 주석 참고).
        thinkingConfig: { thinkingBudget: THINKING_BUDGET_DISABLED },
      },
    };
    // 모델은 REST 경로 파라미터(models/{model})로만 전달한다.
    // GenerateContentRequest 본문에는 model 필드가 없어 넣으면 400 이 난다.

    // 응답 본문 읽기까지 한 덩어리로 타임아웃에 넣는다. 헤더만 온 뒤 본문이 멈춰도
    // 예산을 넘기면 안 되기 때문이다.
    const requestOnce = async (signal: AbortSignal): Promise<string> => {
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
          content?: { parts?: { text?: string }[] };
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

      if (text.length === 0) {
        throw new Error("Gemini response has no text part");
      }

      return text;
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
