import { describe, expect, it } from "vitest";
import { MockLlmProvider } from "../src/ai/MockLlmProvider";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { RaceEventType } from "../src/RaceEventType";
import { SupportedLocale } from "../src/SupportedLocale";

const frame = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
).snapshotAt(122);

const provider = new MockLlmProvider();

const askPit = (level: ExplanationLevel) =>
  provider.answerQuestion({
    question: "Why doesn't VER pit now?",
    locale: SupportedLocale.En,
    explanationLevel: level,
    snapshot: frame.snapshot,
    recentEvents: frame.events,
    favoriteDriverNumbers: [],
  });

describe("Ask AI explanation level", () => {
  it("Beginner 는 개념 설명을 덧붙인다", async () => {
    const answer = await askPit(ExplanationLevel.Beginner);

    expect(answer.answer.toLowerCase()).toContain("tip:");
  });

  it("Expert 는 전략 노트를 덧붙인다", async () => {
    const answer = await askPit(ExplanationLevel.Expert);

    expect(answer.answer.toLowerCase()).toContain("undercut");
  });

  it("Standard 는 부가 설명 없이 기본 답변만 한다", async () => {
    const answer = await askPit(ExplanationLevel.Standard);

    expect(answer.answer.toLowerCase()).not.toContain("tip:");
    expect(answer.answer.toLowerCase()).not.toContain("note:");
  });

  it("수준만 다르고 나머지 답변 본문은 공유한다", async () => {
    const beginner = await askPit(ExplanationLevel.Beginner);
    const standard = await askPit(ExplanationLevel.Standard);

    expect(beginner.answer.startsWith(standard.answer)).toBe(true);
  });
});

describe("AI commentary explanation level", () => {
  const pit = frame.events.find((e) => e.type === RaceEventType.PitStop)!;

  it("Beginner 해설은 입문 설명을 덧붙인다", async () => {
    const commentary = await provider.generateCommentary({
      event: pit,
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Beginner,
      snapshot: frame.snapshot,
    });

    expect(commentary.text.toLowerCase()).toContain("beginner:");
  });

  it("Standard 해설은 부가 설명이 없다", async () => {
    const commentary = await provider.generateCommentary({
      event: pit,
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    expect(commentary.text.toLowerCase()).not.toContain("beginner:");
    expect(commentary.text.toLowerCase()).not.toContain("expert:");
  });
});
