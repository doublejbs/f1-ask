import { describe, expect, it, vi } from "vitest";
import { AiConfidence } from "../src/ai/AiConfidence";
import { FallbackLlmProvider } from "../src/ai/FallbackLlmProvider";
import { MockLlmProvider } from "../src/ai/MockLlmProvider";
import {
  LlmAnswer,
  LlmCommentary,
  LlmSummary,
  RaceLlmProvider,
} from "../src/ai/RaceLlmProvider";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { SupportedLocale } from "../src/SupportedLocale";

const frame = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
).snapshotAt(70);

const question = {
  question: "Who is leading?",
  locale: SupportedLocale.En,
  explanationLevel: ExplanationLevel.Standard,
  snapshot: frame.snapshot,
  recentEvents: frame.events,
  favoriteDriverNumbers: [],
};

// 항상 실패하는 primary provider.
const failingProvider: RaceLlmProvider = {
  answerQuestion: () => Promise.reject(new Error("quota exceeded")),
  generateCommentary: () => Promise.reject(new Error("quota exceeded")),
  generateSummary: () => Promise.reject(new Error("quota exceeded")),
};

describe("FallbackLlmProvider", () => {
  it("primary 성공 시 primary 결과를 쓴다", async () => {
    const primaryAnswer: LlmAnswer = {
      answer: "from primary",
      confidence: AiConfidence.High,
      insufficientData: false,
      dataTimestamp: frame.snapshot.sourceUpdatedAt,
      snapshotVersion: frame.snapshot.version,
      referencedDriverNumbers: [],
      referencedEventIds: [],
      suggestedQuestions: [],
    };
    const primary: RaceLlmProvider = {
      answerQuestion: () => Promise.resolve(primaryAnswer),
      generateCommentary: (): Promise<LlmCommentary> =>
        Promise.resolve({ sourceEventId: "x", text: "primary" }),
      generateSummary: (): Promise<LlmSummary> =>
        Promise.resolve({ text: "primary" }),
    };
    const provider = new FallbackLlmProvider(primary, new MockLlmProvider());

    const result = await provider.answerQuestion(question);

    expect(result.answer).toBe("from primary");
  });

  it("primary 실패 시 fallback(Mock) 결과를 쓴다", async () => {
    const provider = new FallbackLlmProvider(
      failingProvider,
      new MockLlmProvider(),
    );

    const result = await provider.answerQuestion(question);

    // Mock 은 선두 질문에 답할 수 있다.
    expect(result.insufficientData).toBe(false);
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it("primary 실패 시 onFailure 핸들러를 호출한다", async () => {
    const onFailure = vi.fn();
    const provider = new FallbackLlmProvider(
      failingProvider,
      new MockLlmProvider(),
      onFailure,
    );

    await provider.answerQuestion(question);

    expect(onFailure).toHaveBeenCalledOnce();
  });

  it("commentary/summary 도 fallback 한다", async () => {
    const provider = new FallbackLlmProvider(
      failingProvider,
      new MockLlmProvider(),
    );
    const event = frame.events[0]!;

    const commentary = await provider.generateCommentary({
      event,
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    expect(commentary.text.length).toBeGreaterThan(0);
  });
});
