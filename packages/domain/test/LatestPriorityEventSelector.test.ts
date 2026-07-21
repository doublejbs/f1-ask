import { describe, expect, it } from "vitest";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import {
  LATEST_PRIORITY_EVENT_LIMIT,
  selectLatestPriorityEvents,
} from "../src/LatestPriorityEventSelector";

const BASE_MS = Date.parse("2026-07-19T12:00:00.000Z");

// 초 단위 오프셋으로 이벤트를 만든다. 나머지 필드는 판정과 무관한 기본값이다.
const makeEvent = (
  id: string,
  offsetSeconds: number,
  priority: RaceEventPriority,
): RaceEvent => ({
  schemaVersion: 1,
  id,
  sessionId: "test",
  type: RaceEventType.Overtake,
  priority,
  timestamp: new Date(BASE_MS + offsetSeconds * 1000).toISOString(),
  params: {},
  deduplicationKey: id,
});

// 타임스탬프를 직접 지정해 파싱 실패 케이스를 만든다.
const makeBrokenEvent = (id: string, timestamp: string): RaceEvent => ({
  schemaVersion: 1,
  id,
  sessionId: "test",
  type: RaceEventType.Overtake,
  priority: RaceEventPriority.Critical,
  timestamp,
  params: {},
  deduplicationKey: id,
});

const readIds = (events: readonly RaceEvent[]): string[] =>
  events.map((event) => event.id);

describe("selectLatestPriorityEvents", () => {
  it("빈 배열이면 결과가 없다", () => {
    expect(selectLatestPriorityEvents([], BASE_MS)).toEqual([]);
  });

  it("Critical/High 만 최신순으로 돌려준다", () => {
    const events = [
      makeEvent("low", -10, RaceEventPriority.Low),
      makeEvent("high-old", -120, RaceEventPriority.High),
      makeEvent("critical-new", -5, RaceEventPriority.Critical),
      makeEvent("medium", -1, RaceEventPriority.Medium),
      makeEvent("high-new", -30, RaceEventPriority.High),
    ];

    expect(readIds(selectLatestPriorityEvents(events, BASE_MS))).toEqual([
      "critical-new",
      "high-new",
      "high-old",
    ]);
  });

  it("기본 상한은 10건이다", () => {
    const events = Array.from({ length: 16 }, (_, index) =>
      makeEvent(`e-${index}`, -index, RaceEventPriority.High),
    );

    const selected = selectLatestPriorityEvents(events, BASE_MS);

    expect(LATEST_PRIORITY_EVENT_LIMIT).toBe(10);
    expect(selected).toHaveLength(LATEST_PRIORITY_EVENT_LIMIT);
    expect(readIds(selected)).toEqual([
      "e-0",
      "e-1",
      "e-2",
      "e-3",
      "e-4",
      "e-5",
      "e-6",
      "e-7",
      "e-8",
      "e-9",
    ]);
  });

  it("limit 으로 건수를 줄일 수 있고 0 이하면 빈 배열이다", () => {
    const events = [
      makeEvent("a", -1, RaceEventPriority.Critical),
      makeEvent("b", -2, RaceEventPriority.High),
    ];

    expect(readIds(selectLatestPriorityEvents(events, BASE_MS, 1))).toEqual([
      "a",
    ]);
    expect(selectLatestPriorityEvents(events, BASE_MS, 0)).toEqual([]);
  });

  it("후보가 상한보다 적으면 있는 만큼만 돌려준다", () => {
    const events = [makeEvent("only", -3, RaceEventPriority.Critical)];

    expect(readIds(selectLatestPriorityEvents(events, BASE_MS))).toEqual([
      "only",
    ]);
  });

  it("atMs 이후의 미래 이벤트는 제외한다", () => {
    const events = [
      makeEvent("future", 60, RaceEventPriority.Critical),
      makeEvent("past", -60, RaceEventPriority.Critical),
    ];

    expect(readIds(selectLatestPriorityEvents(events, BASE_MS))).toEqual([
      "past",
    ]);
  });

  it("타임스탬프를 파싱할 수 없으면 제외한다", () => {
    const events = [
      makeBrokenEvent("broken", "not-a-timestamp"),
      makeEvent("ok", -10, RaceEventPriority.Critical),
    ];

    expect(readIds(selectLatestPriorityEvents(events, BASE_MS))).toEqual([
      "ok",
    ]);
  });

  it("동시각이면 나중에 들어온 이벤트가 위로 온다", () => {
    const events = [
      makeEvent("first", -10, RaceEventPriority.High),
      makeEvent("second", -10, RaceEventPriority.High),
    ];

    expect(readIds(selectLatestPriorityEvents(events, BASE_MS))).toEqual([
      "second",
      "first",
    ]);
  });
});
