import { describe, expect, it } from "vitest";
import {
  EMPTY_EVENT_WRITE_CURSOR,
  parseEventWriteCursor,
  selectUnwrittenEvents,
} from "../src/worker/EventWriteCursor";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";

const T0 = Date.parse("2026-07-19T13:00:00.000Z");

const makeEvent = (key: string, atSecond: number): RaceEvent => ({
  schemaVersion: 1,
  id: key,
  sessionId: "test-session",
  type: RaceEventType.PitStop,
  priority: RaceEventPriority.High,
  timestamp: new Date(T0 + atSecond * 1000).toISOString(),
  params: {},
  deduplicationKey: key,
});

describe("이벤트 쓰기 커서", () => {
  it("빈 커서에서는 전부 새 이벤트다", () => {
    const events = [makeEvent("a", 1), makeEvent("b", 2)];
    const result = selectUnwrittenEvents(events, EMPTY_EVENT_WRITE_CURSOR);

    expect(result.events).toHaveLength(2);
    expect(result.nextCursor.writtenKeys).toEqual(["a", "b"]);
  });

  it("이미 쓴 키는 다시 쓰지 않는다", () => {
    const events = [makeEvent("a", 1), makeEvent("b", 2)];
    const first = selectUnwrittenEvents(events, EMPTY_EVENT_WRITE_CURSOR);
    const second = selectUnwrittenEvents(events, first.nextCursor);

    expect(second.events).toHaveLength(0);
    expect(second.nextCursor.writtenKeys).toEqual(["a", "b"]);
  });

  it("누적 결과에서 새로 생긴 것만 골라낸다", () => {
    // 폴러는 매번 "지금까지의 전체 이벤트"를 다시 계산한다.
    const poll1 = [makeEvent("a", 1)];
    const poll2 = [makeEvent("a", 1), makeEvent("b", 2)];
    const poll3 = [makeEvent("a", 1), makeEvent("b", 2), makeEvent("c", 3)];

    let cursor = EMPTY_EVENT_WRITE_CURSOR;
    const written: string[][] = [];

    for (const events of [poll1, poll2, poll3]) {
      const result = selectUnwrittenEvents(events, cursor);

      written.push(result.events.map((event) => event.deduplicationKey));
      cursor = result.nextCursor;
    }

    expect(written).toEqual([["a"], ["b"], ["c"]]);
  });

  it("뒤늦게 도착한 과거 시각 이벤트도 쓴다", () => {
    // team_radio / session_result 는 발생 시각보다 늦게 API 에 올라온다.
    // timestamp 고수위 방식이면 여기서 조용히 누락된다.
    const first = selectUnwrittenEvents(
      [makeEvent("late-window-start", 10), makeEvent("newest", 100)],
      EMPTY_EVENT_WRITE_CURSOR,
    );
    const second = selectUnwrittenEvents(
      [
        makeEvent("late-window-start", 10),
        makeEvent("newest", 100),
        // 이미 쓴 최신 이벤트보다 90초 앞선 시각으로 뒤늦게 등장.
        makeEvent("arrived-late", 20),
      ],
      first.nextCursor,
    );

    expect(second.events.map((event) => event.deduplicationKey)).toEqual([
      "arrived-late",
    ]);
  });

  it("한 번의 호출 안에 중복 키가 있어도 한 번만 쓴다", () => {
    const result = selectUnwrittenEvents(
      [makeEvent("dup", 1), makeEvent("dup", 1)],
      EMPTY_EVENT_WRITE_CURSOR,
    );

    expect(result.events).toHaveLength(1);
    expect(result.nextCursor.writtenKeys).toEqual(["dup"]);
  });

  it("발생 시각이 오래된 것부터 쓴다", () => {
    const result = selectUnwrittenEvents(
      [makeEvent("late", 30), makeEvent("early", 10), makeEvent("mid", 20)],
      EMPTY_EVENT_WRITE_CURSOR,
    );

    expect(result.events.map((event) => event.deduplicationKey)).toEqual([
      "early",
      "mid",
      "late",
    ]);
  });

  it("상한을 넘으면 가장 오래된 키부터 버린다", () => {
    const events = Array.from({ length: 5 }, (_, index) =>
      makeEvent(`k${index}`, index),
    );
    const result = selectUnwrittenEvents(events, EMPTY_EVENT_WRITE_CURSOR, 3);

    expect(result.events).toHaveLength(5);
    expect(result.nextCursor.writtenKeys).toEqual(["k2", "k3", "k4"]);
  });

  it("문서에서 커서를 복원한다", () => {
    expect(parseEventWriteCursor({ writtenKeys: ["a", "b"] }).writtenKeys).toEqual([
      "a",
      "b",
    ]);
  });

  it("문서가 없거나 깨졌으면 빈 커서로 시작한다", () => {
    // 최악의 경우 이벤트를 한 번 더 쓸 뿐, 문서 id 가 키라 멱등이다.
    expect(parseEventWriteCursor(undefined).writtenKeys).toEqual([]);
    expect(parseEventWriteCursor(null).writtenKeys).toEqual([]);
    expect(parseEventWriteCursor({ writtenKeys: "nope" }).writtenKeys).toEqual([]);
    expect(
      parseEventWriteCursor({ writtenKeys: ["ok", 42, null, ""] }).writtenKeys,
    ).toEqual(["ok"]);
  });
});
