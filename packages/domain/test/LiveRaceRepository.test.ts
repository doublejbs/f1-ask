import { describe, expect, it } from "vitest";
import {
  eventDocId,
  firestorePaths,
  toLiveSnapshotDoc,
  toSessionDoc,
} from "../src/firestore/LiveRaceRepository";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";

const frame = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
).snapshotAt(70);

describe("firestorePaths", () => {
  it("공개 경기 데이터 경로를 구성한다", () => {
    expect(firestorePaths.session("s1")).toBe("sessions/s1");
    expect(firestorePaths.liveCurrent("s1")).toBe("sessions/s1/live/current");
    expect(firestorePaths.eventDoc("s1", "e1")).toBe("sessions/s1/events/e1");
  });
});

describe("Firestore document mappers", () => {
  it("live snapshot 문서는 JSON 직렬화 후에도 스냅샷과 동일하다", () => {
    const doc = toLiveSnapshotDoc(frame.snapshot);
    const roundTrip = JSON.parse(JSON.stringify(doc));

    expect(roundTrip).toEqual(frame.snapshot);
  });

  it("세션 문서는 공개 메타만 담는다", () => {
    const doc = toSessionDoc(frame.snapshot);

    expect(doc.sessionId).toBe(frame.snapshot.sessionId);
    expect(doc.status).toBe(frame.snapshot.status);
    expect(doc).not.toHaveProperty("drivers");
  });

  it("이벤트 문서 ID 는 deduplicationKey 다 (중복 방지)", () => {
    const event = frame.events[0];

    expect(event).toBeDefined();
    expect(eventDocId(event!)).toBe(event!.deduplicationKey);
  });
});
