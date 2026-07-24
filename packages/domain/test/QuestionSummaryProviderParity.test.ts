import { describe, expect, it } from "vitest";
import { ClaudeFetch, ClaudeProvider } from "../src/ai/ClaudeProvider";
import { GeminiFetch, GeminiProvider } from "../src/ai/GeminiProvider";
import { OpenAiFetch, OpenAiProvider } from "../src/ai/OpenAiProvider";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { LiveRaceContextSummary } from "../src/LiveRaceContextSummary";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { SafetyCarKind } from "../src/SafetyCarKind";
import { SessionStatus } from "../src/SessionStatus";
import { SupportedLocale } from "../src/SupportedLocale";
import { TireCompound } from "../src/TireCompound";

// 세 provider(Claude·Gemini·OpenAI)가 스냅샷의 결정론적 요약(contextSummary)을 질문
// 컨텍스트에 싣는지 검증한다. 요약 주입은 공용 함수(toQuestionSummaryContext)로 한 곳에서만
// 하므로, 세 provider 요청 본문에 같은 요약이 실려야 한다 — 갈라지면 이 테스트가 잡는다.

const baseSnapshot = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
).snapshotAt(70).snapshot;

const SUMMARY: LiveRaceContextSummary = {
  pits: { totalStops: 28, medianDurationSeconds: 24.7365 },
  stints: [
    {
      driverNumber: 44,
      stintCount: 2,
      currentStintStartLap: 21,
      previousCompound: TireCompound.Medium,
      lastPitLap: 20,
    },
  ],
  overtakes: { total: 214, mostActiveDriverNumber: 4, mostActiveCount: 9 },
};

const snapshotWithSummary: LiveRaceSnapshot = {
  ...baseSnapshot,
  contextSummary: SUMMARY,
};

// narrative 를 실은 요약. toQuestionSummaryContext 가 요약을 통째로 통과시키므로 narrative 도
// 세 provider 컨텍스트에 자동 포함되어야 한다 (docs/25 §계약 확장, 수용기준6).
const SUMMARY_WITH_NARRATIVE: LiveRaceContextSummary = {
  ...SUMMARY,
  narrative: {
    progress: { currentLap: 26, totalLaps: 44, phase: SessionStatus.Green },
    leadChanges: [1, 4, 1],
    retirements: [{ driverNumber: 18, lap: 26 }],
    pitWaves: [{ startLap: 14, endLap: 18, count: 8 }],
    biggestMovers: [{ driverNumber: 63, from: 16, to: 5, delta: 11 }],
    fastestLap: { driverNumber: 4, lapSeconds: 104.321, lap: 33 },
    weatherShifts: [{ lap: 20, toWet: true }],
    safetyCars: [{ kind: SafetyCarKind.Sc, startLap: 14 }],
  },
};

const snapshotWithNarrative: LiveRaceSnapshot = {
  ...baseSnapshot,
  contextSummary: SUMMARY_WITH_NARRATIVE,
};

const captureClaudeBody = async (
  snapshot: LiveRaceSnapshot,
): Promise<string> => {
  let body = "";
  const fetchImpl: ClaudeFetch = async (_url, init) => {
    body = init.body;

    return {
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: "text", text: '{"answer":"ok"}' }] }),
    };
  };

  const provider = new ClaudeProvider({ apiKey: "sk-ant-test", fetchImpl });

  await provider.answerQuestion({
    question: "피트 상황 알려줘",
    locale: SupportedLocale.Ko,
    explanationLevel: ExplanationLevel.Standard,
    snapshot,
    recentEvents: [],
    favoriteDriverNumbers: [],
  });

  return body;
};

const captureGeminiBody = async (
  snapshot: LiveRaceSnapshot,
): Promise<string> => {
  let body = "";
  const fetchImpl: GeminiFetch = async (_url, init) => {
    body = init.body;

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          { content: { role: "model", parts: [{ text: '{"answer":"ok"}' }] } },
        ],
      }),
    };
  };

  const provider = new GeminiProvider({ apiKey: "gemini-test", fetchImpl });

  await provider.answerQuestion({
    question: "피트 상황 알려줘",
    locale: SupportedLocale.Ko,
    explanationLevel: ExplanationLevel.Standard,
    snapshot,
    recentEvents: [],
    favoriteDriverNumbers: [],
  });

  return body;
};

const captureOpenAiBody = async (
  snapshot: LiveRaceSnapshot,
): Promise<string> => {
  let body = "";
  const fetchImpl: OpenAiFetch = async (_url, init) => {
    body = init.body;

    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"answer":"ok"}' } }],
      }),
    };
  };

  const provider = new OpenAiProvider({ apiKey: "sk-test", fetchImpl });

  await provider.answerQuestion({
    question: "피트 상황 알려줘",
    locale: SupportedLocale.Ko,
    explanationLevel: ExplanationLevel.Standard,
    snapshot,
    recentEvents: [],
    favoriteDriverNumbers: [],
  });

  return body;
};

describe("provider parity — 세 provider 가 요약을 질문 컨텍스트에 싣는다", () => {
  it("각 provider 요청 본문에 피트·스틴트·추월 요약이 들어온다", async () => {
    const [claude, gemini, openai] = await Promise.all([
      captureClaudeBody(snapshotWithSummary),
      captureGeminiBody(snapshotWithSummary),
      captureOpenAiBody(snapshotWithSummary),
    ]);

    // 컨텍스트 JSON 은 요청 본문 안에 이스케이프된 문자열로 실린다. 따옴표·콜론이 escaping 에
    // 흔들리지 않도록, 요약에만 등장하는 키·값 토큰(따옴표 없는)으로 존재를 확인한다.
    for (const body of [claude, gemini, openai]) {
      // 피트 요약(총횟수·중앙값).
      expect(body).toContain("totalStops");
      expect(body).toContain("24.7365");
      // 추월 요약이 한 덩어리로 들어온다.
      expect(body).toContain("mostActiveCount");
      // 스틴트 이력(직전 compound).
      expect(body).toContain("previousCompound");
    }
  });

  it("narrative 가 있으면 세 provider 컨텍스트에 통째로 실린다 (자동 포함)", async () => {
    const [claude, gemini, openai] = await Promise.all([
      captureClaudeBody(snapshotWithNarrative),
      captureGeminiBody(snapshotWithNarrative),
      captureOpenAiBody(snapshotWithNarrative),
    ]);

    for (const body of [claude, gemini, openai]) {
      // narrative 서브객체 키들이 컨텍스트에 실렸는지 확인한다 — 스키마·요약 통과 경로가 살아 있음.
      expect(body).toContain("narrative");
      expect(body).toContain("leadChanges");
      expect(body).toContain("biggestMovers");
      // 서사 값(피트웨이브 대수·SC 구분)도 실린다.
      expect(body).toContain("pitWaves");
      expect(body).toContain("safetyCars");
    }
  });

  it("요약이 없으면 summary 는 null 로 실린다 (LLM 이 지어내지 않도록)", async () => {
    const claude = await captureClaudeBody(baseSnapshot);

    expect(baseSnapshot.contextSummary).toBeUndefined();
    // summary 키는 있지만 값이 null 이라 요약 하위 키가 하나도 없다.
    expect(claude).toContain("summary");
    expect(claude).not.toContain("totalStops");
  });
});
