import { describe, expect, it } from "vitest";
import {
  attachCommentary,
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

describe("attachCommentary", () => {
  const events = frame.events.slice(0, 3);
  const [first, second, third] = events;

  it("sourceEventId 가 일치하는 해설을 이벤트에 붙인다", () => {
    const attached = attachCommentary(events, [
      toAiCommentary(second!, "second commentary"),
    ]);

    expect(attached).toHaveLength(3);
    expect(attached[1]!.event.id).toBe(second!.id);
    expect(attached[1]!.commentary?.text).toBe("second commentary");
  });

  it("해설이 없는 이벤트도 commentary: null 로 포함한다", () => {
    const attached = attachCommentary(events, [
      toAiCommentary(second!, "second commentary"),
    ]);

    expect(attached[0]!.commentary).toBeNull();
    expect(attached[2]!.commentary).toBeNull();
    expect(attached.map((item) => item.event.id)).toEqual([
      first!.id,
      second!.id,
      third!.id,
    ]);
  });

  it("대응하는 이벤트가 없는 해설은 무시한다", () => {
    const orphan = toAiCommentary(
      { ...first!, id: "event:does-not-exist" },
      "orphan",
    );
    const attached = attachCommentary(events, [orphan]);

    expect(attached).toHaveLength(3);
    expect(attached.every((item) => item.commentary === null)).toBe(true);
  });

  it("빈 배열을 안전하게 처리한다", () => {
    expect(attachCommentary([], [])).toEqual([]);
    expect(attachCommentary([], [toAiCommentary(first!, "x")])).toEqual([]);
    expect(attachCommentary(events, []).every((i) => i.commentary === null)).toBe(
      true,
    );
  });

  it("이벤트 순서를 보존한다", () => {
    const attached = attachCommentary(events, [
      toAiCommentary(third!, "c"),
      toAiCommentary(first!, "a"),
    ]);

    expect(attached.map((item) => item.commentary?.text ?? null)).toEqual([
      "a",
      null,
      "c",
    ]);
  });
});

describe("toAiCommentary isMock", () => {
  it("기본값은 false 이고 명시하면 true 가 된다", () => {
    const event = frame.events[0]!;

    expect(toAiCommentary(event, "hello").isMock).toBe(false);
    expect(toAiCommentary(event, "hello", true).isMock).toBe(true);
  });

  it("MockLlmProvider 해설은 isMock 을 표시한다", async () => {
    const commentary = await provider.generateCommentary({
      event: frame.events[0]!,
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    expect(commentary.isMock).toBe(true);
  });
});
