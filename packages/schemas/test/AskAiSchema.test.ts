import {
  buildCommentaryContext,
  DEFAULT_MOCK_SCENARIO,
  ExplanationLevel,
  LlmQuestionFocus,
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

// 특정 해설(과거 이벤트)에 대한 질문의 초점. 실제 폴러가 만드는 이벤트 형태를 흉내낸다.
const focusEvent = frame.events[0]!;

const focus: LlmQuestionFocus = {
  event: focusEvent,
  context: buildCommentaryContext(focusEvent, frame.snapshot),
};

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

  it("포커스(이벤트+시점 맥락)가 있는 질문을 통과시키고 그대로 복원한다", () => {
    const request = {
      question: "Why the penalty?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
      focus,
    };

    const parsed = parseAskAiRequest(request);

    expect(parsed.focus?.event.id).toBe(focusEvent.id);
    expect(parsed.focus?.context).toEqual(focus.context);
  });

  it("포커스는 optional 이다 — 없는 경기 전반 질문도 통과한다", () => {
    const request = {
      question: "Who is leading now?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    };

    const parsed = parseAskAiRequest(request);

    expect(parsed.focus).toBeUndefined();
  });

  it("형태가 깨진 포커스는 거부한다", () => {
    expect(() =>
      parseAskAiRequest({
        question: "Why the penalty?",
        locale: SupportedLocale.En,
        explanationLevel: ExplanationLevel.Standard,
        snapshot: frame.snapshot,
        recentEvents: frame.events,
        favoriteDriverNumbers: [],
        // context(필수)가 빠진 포커스.
        focus: { event: focusEvent },
      }),
    ).toThrow();
  });
});

describe("llmAnswerSchema", () => {
  it("provider 응답을 통과시킨다", async () => {
    const answer = await new MockLlmProvider().answerQuestion({
      question: "Who is leading now?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    expect(() => parseLlmAnswer(answer)).not.toThrow();
  });
});
