import { describe, expect, it } from "vitest";
import { mergeEventsByDeduplicationKey } from "../src/worker/RaceEventMerge";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";

const T0 = Date.parse("2026-07-19T13:00:00.000Z");

const makeEvent = (
  key: string,
  atSecond: number,
  lapNumber?: number,
): RaceEvent => ({
  schemaVersion: 1,
  id: key,
  sessionId: "test-session",
  type: RaceEventType.PitStop,
  priority: RaceEventPriority.High,
  lapNumber,
  timestamp: new Date(T0 + atSecond * 1000).toISOString(),
  params: {},
  deduplicationKey: key,
});

describe("deduplicationKey 병합", () => {
  it("서로 다른 키는 전부 남는다", () => {
    const merged = mergeEventsByDeduplicationKey(
      [makeEvent("a", 1), makeEvent("b", 2)],
      [makeEvent("c", 3)],
    );

    expect(merged.map((event) => event.deduplicationKey)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("같은 키가 겹치면 나중 묶음이 이긴다", () => {
    const merged = mergeEventsByDeduplicationKey(
      [makeEvent("a", 1, 10)],
      [makeEvent("a", 1, 20)],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.lapNumber).toBe(20);
  });

  it("마지막 프레임에 없는 창 중간 발화 이벤트가 병합 결과에 남는다", () => {
    // 엣지 트리거 발화는 그 폴에만 존재한다 — 마지막 프레임(lastFrame.events)에는
    // 없어도 누적분으로 넘겨지면 해설 대상에 포함되어야 한다.
    const lastFrameEvents = [makeEvent("pit:1", 30)];
    const firedMidWindow = [makeEvent("forecast:44:1", 12)];
    const merged = mergeEventsByDeduplicationKey(
      lastFrameEvents,
      firedMidWindow,
    );

    expect(merged.map((event) => event.deduplicationKey)).toEqual([
      "pit:1",
      "forecast:44:1",
    ]);
  });

  it("빈 입력이면 빈 배열이다", () => {
    expect(mergeEventsByDeduplicationKey([], [])).toEqual([]);
  });
});
