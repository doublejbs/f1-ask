import {
  DEFAULT_MOCK_SCENARIO,
  ExplanationLevel,
  MockLlmProvider,
  MockRaceEngine,
  SupportedLocale,
} from "@f1/domain";
import { describe, expect, it } from "vitest";
import { parseAskAiRequest, parseLlmAnswer } from "../src/AskAiSchema";

const frame = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
).snapshotAt(70);

describe("askAiRequestSchema", () => {
  it("유효한 요청을 통과시킨다", () => {
    const request = {
      question: "How is NOR's pace?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [4],
    };

    expect(() => parseAskAiRequest(request)).not.toThrow();
  });

  it("빈 질문은 거부한다", () => {
    expect(() =>
      parseAskAiRequest({
        question: "",
        locale: SupportedLocale.En,
        snapshot: frame.snapshot,
        recentEvents: [],
        favoriteDriverNumbers: [],
      }),
    ).toThrow();
  });
});

describe("llmAnswerSchema", () => {
  it("provider 응답을 통과시킨다", async () => {
    const answer = await new MockLlmProvider().answerQuestion({
      question: "Who is leading now?",
      locale: SupportedLocale.En,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    expect(() => parseLlmAnswer(answer)).not.toThrow();
  });
});
