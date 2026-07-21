import { LiveDriverState } from "../LiveDriverState";
import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { RaceEvent } from "../RaceEvent";
import { RaceSummaryData } from "../RaceSummary";
import { SupportedLocale } from "../SupportedLocale";
import { AiConfidence } from "./AiConfidence";
import { buildCommentaryPrompt } from "./CommentaryPrompt";
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

// 주입 가능한 fetch (네트워크 없이 단위 테스트).
export type OpenAiFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type OpenAiProviderOptions = {
  apiKey: string;
  model?: string;
  fetchImpl?: OpenAiFetch;
  baseUrl?: string;
  // 요청 1회의 상한. 기본값은 워커의 해설 예산과 같은 출처다(LlmRequestTimeout.ts).
  timeoutMs?: number;
};

export const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const CONTEXT_DRIVER_LIMIT = 20;
const RECENT_EVENT_LIMIT = 8;

// AI 규칙 (PRD §14) 을 프롬프트로 인코딩한다.
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
  gapToLeader: number | null;
  interval: number | null;
  tire: string;
  tireAgeLaps: number | null;
  pits: number;
  lastLap: number | null;
  inPit: boolean;
  retired: boolean;
};

const toDriverContext = (driver: LiveDriverState): DriverContext => ({
  n: driver.driverNumber,
  code: driver.code,
  team: driver.teamName,
  pos: driver.position,
  gapToLeader: driver.gapToLeaderSeconds,
  interval: driver.intervalToAheadSeconds,
  tire: driver.compound,
  tireAgeLaps: driver.tireAgeLaps,
  pits: driver.pitStopCount,
  lastLap: driver.lastLapSeconds,
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
  const events = recentEvents.slice(-RECENT_EVENT_LIMIT).map((event) => ({
    type: event.type,
    driverNumber: event.driverNumber ?? null,
    params: event.params,
  }));

  return JSON.stringify({
    session: {
      name: snapshot.sessionName,
      circuit: snapshot.circuitName,
      status: snapshot.status,
      currentLap: snapshot.currentLap,
      totalLaps: snapshot.totalLaps,
    },
    favoriteDriverNumbers,
    drivers,
    recentEvents: events,
  });
};

const parseConfidence = (value: unknown): AiConfidence => {
  if (value === AiConfidence.High || value === AiConfidence.Low) {
    return value;
  }

  return AiConfidence.Medium;
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

// 실제 OpenAI provider. RaceLlmProvider 인터페이스를 구현하며 서버에서만 사용한다.
// (API 키는 클라이언트 번들에 포함하지 않는다.)
export class OpenAiProvider implements RaceLlmProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: OpenAiFetch;
  private readonly timeoutMs: number;

  constructor(options: OpenAiProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? OPENAI_DEFAULT_MODEL;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl =
      options.fetchImpl ??
      ((url, init) => fetch(url, init) as unknown as ReturnType<OpenAiFetch>);
    this.timeoutMs = options.timeoutMs ?? LLM_REQUEST_TIMEOUT_MS;
  }

  async answerQuestion(request: LlmQuestionRequest): Promise<LlmAnswer> {
    const context = buildQuestionContext(
      request.snapshot,
      request.recentEvents,
      request.favoriteDriverNumbers,
    );

    const system = [
      SYSTEM_RULES,
      `Respond in ${LOCALE_LANGUAGE[request.locale]}.`,
      LEVEL_GUIDANCE[request.explanationLevel],
      'Return a JSON object: {"answer": string, "confidence": "low"|"medium"|"high", "insufficientData": boolean, "referencedDriverNumbers": number[]}.',
    ].join("\n");

    const user = `Question: ${request.question}\n\nCurrent race data (JSON):\n${context}`;

    const content = await this.chat(system, user, { json: true, maxTokens: 300 });
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
    const { system, user } = buildCommentaryPrompt(request);

    const text = await this.chat(system, user, { json: false, maxTokens: 120 });

    return { sourceEventId: request.event.id, text: text.trim() };
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
      "Write a short post-session recap (2-3 sentences) using only these facts.",
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

    const text = await this.chat(system, user, { json: false, maxTokens: 200 });

    return { text: text.trim() };
  }

  private async chat(
    system: string,
    user: string,
    options: { json: boolean; maxTokens: number },
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      temperature: 0.3,
      max_tokens: options.maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };

    if (options.json) {
      body.response_format = { type: "json_object" };
    }

    // 응답 본문 읽기까지 한 덩어리로 타임아웃에 넣는다. 헤더만 온 뒤 본문이 멈춰도
    // 예산을 넘기면 안 되기 때문이다.
    const requestOnce = async (signal: AbortSignal): Promise<string> => {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        throw new Error(`OpenAI request failed: ${response.status}`);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };

      return data.choices?.[0]?.message?.content ?? "";
    };

    return withLlmRequestTimeout(requestOnce, {
      timeoutMs: this.timeoutMs,
      label: `OpenAI (model: ${this.model})`,
    });
  }

  private safeJson(
    content: string,
  ): { answer?: unknown; confidence?: unknown; insufficientData?: unknown; referencedDriverNumbers?: unknown } | null {
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
