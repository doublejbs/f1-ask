import { ExplanationLevel } from "../ExplanationLevel";
import { LiveDriverState } from "../LiveDriverState";
import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { RaceEvent } from "../RaceEvent";
import { RaceSummaryData } from "../RaceSummary";
import { SupportedLocale } from "../SupportedLocale";
import { AiConfidence } from "./AiConfidence";
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
export type ClaudeFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type ClaudeProviderOptions = {
  apiKey: string;
  model?: string;
  fetchImpl?: ClaudeFetch;
  baseUrl?: string;
};

// skill 지침: 사용자가 다른 모델을 명시하지 않으면 claude-opus-4-8 을 사용한다.
const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";
const CONTEXT_DRIVER_LIMIT = 20;
const RECENT_EVENT_LIMIT = 8;

const LOCALE_LANGUAGE: Record<SupportedLocale, string> = {
  [SupportedLocale.En]: "English",
  [SupportedLocale.Ko]: "Korean",
  [SupportedLocale.Ja]: "Japanese",
};

const LEVEL_GUIDANCE: Record<ExplanationLevel, string> = {
  [ExplanationLevel.Beginner]:
    "The reader is a beginner: briefly define any jargon you use in plain words.",
  [ExplanationLevel.Standard]: "The reader knows the basics of F1.",
  [ExplanationLevel.Expert]:
    "The reader is an expert: you may add one concise strategic nuance.",
};

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
  [SupportedLocale.Ja]: ["今は誰が首位？", "首位のペースは？", "ピットインした人は？"],
};

// 실제 Anthropic Claude provider. RaceLlmProvider 인터페이스를 구현하며 서버에서만 사용한다.
// (API 키는 클라이언트 번들에 포함하지 않는다.)
export class ClaudeProvider implements RaceLlmProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: ClaudeFetch;

  constructor(options: ClaudeProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl =
      options.fetchImpl ??
      ((url, init) => fetch(url, init) as unknown as ReturnType<ClaudeFetch>);
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
      'Reply with ONLY a JSON object (no markdown, no prose around it): {"answer": string, "confidence": "low"|"medium"|"high", "insufficientData": boolean, "referencedDriverNumbers": number[]}.',
    ].join("\n");

    const user = `Question: ${request.question}\n\nCurrent race data (JSON):\n${context}`;

    const content = await this.message(system, user, 300);
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
    const system = [
      SYSTEM_RULES,
      `Respond in ${LOCALE_LANGUAGE[request.locale]}.`,
      LEVEL_GUIDANCE[request.explanationLevel],
      "Explain the strategic meaning of this single event in one short sentence. Do not replace TV commentary. Reply with only the sentence.",
    ].join("\n");

    const user = `Event (type + params): ${JSON.stringify({
      type: request.event.type,
      driverNumber: request.event.driverNumber ?? null,
      params: request.event.params,
    })}\n\nSession status: ${request.snapshot.status}, lap ${request.snapshot.currentLap ?? "?"}/${request.snapshot.totalLaps ?? "?"}.`;

    const text = await this.message(system, user, 120);

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

    const text = await this.message(system, user, 200);

    return { text: text.trim() };
  }

  // Anthropic Messages API 호출. system 은 top-level 파라미터로 전달한다.
  private async message(
    system: string,
    user: string,
    maxTokens: number,
  ): Promise<string> {
    const body = {
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    };

    const response = await this.fetchImpl(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Claude request failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      content?: { type: string; text?: string }[];
    };

    // content[] 배열에서 text 블록을 합친다.
    return (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text ?? "")
      .join("");
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
