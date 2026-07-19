import { describe, expect, it } from "vitest";
import {
  isCommentaryEligible,
  selectCommentaryEvents,
  toAiCommentary,
} from "../src/ai/AiCommentary";
import { MockLlmProvider } from "../src/ai/MockLlmProvider";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import { SupportedLocale } from "../src/SupportedLocale";

const START_EPOCH = Date.parse("2026-07-19T05:00:00.000Z");

const frame = new MockRaceEngine(DEFAULT_MOCK_SCENARIO, START_EPOCH).snapshotAt(
  122,
);

const provider = new MockLlmProvider();

describe("selectCommentaryEvents", () => {
  it("high/critical 이벤트만 해설 대상으로 선별한다", () => {
    const selected = selectCommentaryEvents(frame.events, 100);

    expect(selected.length).toBeGreaterThan(0);

    for (const event of selected) {
      expect(isCommentaryEligible(event)).toBe(true);
      expect(
        event.priority === RaceEventPriority.High ||
          event.priority === RaceEventPriority.Critical,
      ).toBe(true);
    }
  });

  it("low/medium 이벤트는 제외한다", () => {
    const selected = selectCommentaryEvents(frame.events, 100);
    const hasLowOrMedium = selected.some(
      (event) =>
        event.priority === RaceEventPriority.Low ||
        event.priority === RaceEventPriority.Medium,
    );

    expect(hasLowOrMedium).toBe(false);
  });

  it("limit 을 지킨다", () => {
    expect(selectCommentaryEvents(frame.events, 2).length).toBeLessThanOrEqual(2);
  });
});

describe("MockLlmProvider.generateCommentary", () => {
  it("세이프티카 해설은 전략적 의미를 설명한다", async () => {
    const safetyCar = frame.events.find(
      (event) => event.type === RaceEventType.SafetyCar,
    );

    expect(safetyCar).toBeDefined();

    const commentary = await provider.generateCommentary({
      event: safetyCar!,
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    expect(commentary.sourceEventId).toBe(safetyCar!.id);
    expect(commentary.text.toLowerCase()).toContain("safety car");
  });

  it("결정론적이고 locale 에 따라 언어가 바뀐다", async () => {
    const overtake = frame.events.find(
      (event) => event.type === RaceEventType.Overtake,
    )!;

    const en1 = await provider.generateCommentary({
      event: overtake,
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });
    const en2 = await provider.generateCommentary({
      event: overtake,
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });
    const ja = await provider.generateCommentary({
      event: overtake,
      locale: SupportedLocale.Ja,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    expect(en1).toEqual(en2);
    expect(ja.text).not.toBe(en1.text);
  });

  it("피트 해설은 팀 전략을 단정하지 않는다", async () => {
    const pit = frame.events.find(
      (event) => event.type === RaceEventType.PitStop,
    )!;

    const commentary = await provider.generateCommentary({
      event: pit,
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    expect(commentary.text.toLowerCase()).toContain("can't be confirmed");
  });
});

describe("toAiCommentary", () => {
  it("이벤트 기준 결정론적 id 를 만든다", () => {
    const event = frame.events[0]!;
    const commentary = toAiCommentary(event, "hello");

    expect(commentary.sourceEventId).toBe(event.id);
    expect(commentary.id).toBe(`commentary:${event.id}`);
    expect(commentary.text).toBe("hello");
  });
});
