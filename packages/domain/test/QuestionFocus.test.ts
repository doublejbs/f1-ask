import { describe, expect, it } from "vitest";
import { AiCommentary, toAiCommentary } from "../src/ai/AiCommentary";
import { buildCommentaryContext } from "../src/ai/CommentaryContext";
import { buildLlmQuestionFocus } from "../src/ai/QuestionFocus";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";

const frame = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
).snapshotAt(70);

const buildEvent = (id: string, driverNumber: number): RaceEvent => ({
  schemaVersion: 1,
  id,
  sessionId: frame.snapshot.sessionId,
  type: RaceEventType.Penalty,
  priority: RaceEventPriority.High,
  driverNumber,
  lapNumber: 12,
  timestamp: "2026-07-19T05:00:00.000Z",
  params: { seconds: 5 },
  deduplicationKey: `dedup:${id}`,
});

const targetNumber = frame.snapshot.drivers[4]!.driverNumber;
const focusEvent = buildEvent("event:penalty", targetNumber);
const context = buildCommentaryContext(focusEvent, frame.snapshot);

describe("buildLlmQuestionFocus", () => {
  it("시점 맥락과 원본 이벤트가 모두 있으면 focus 를 조립한다", () => {
    const commentary = toAiCommentary(
      focusEvent,
      "HAM 5초 페널티",
      false,
      context,
    );

    const focus = buildLlmQuestionFocus(commentary, [focusEvent]);

    expect(focus).not.toBeNull();
    expect(focus?.event.id).toBe(focusEvent.id);
    expect(focus?.context).toEqual(context);
  });

  it("pointInTimeContext 가 없으면 null 을 돌려준다(옛/mock 해설)", () => {
    const commentary = toAiCommentary(focusEvent, "HAM 5초 페널티", false);

    expect(buildLlmQuestionFocus(commentary, [focusEvent])).toBeNull();
  });

  it("원본 이벤트를 목록에서 못 찾으면 null 을 돌려준다", () => {
    const orphan: AiCommentary = {
      id: "commentary:missing",
      sourceEventId: "event:missing",
      sourceEventType: RaceEventType.Penalty,
      priority: RaceEventPriority.High,
      text: "사라진 이벤트",
      timestamp: "2026-07-19T05:00:00.000Z",
      isMock: false,
      pointInTimeContext: context,
    };

    expect(buildLlmQuestionFocus(orphan, [focusEvent])).toBeNull();
  });
});
