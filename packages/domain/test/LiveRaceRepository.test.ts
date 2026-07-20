import { describe, expect, it } from "vitest";
import {
  buildEventQueryPlan,
  eventDocId,
  FIRESTORE_IN_MAX_VALUES,
  firestorePaths,
  toLiveSnapshotDoc,
  toSessionDoc,
} from "../src/firestore/LiveRaceRepository";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import {
  isPrimaryRaceEvent,
  PRIMARY_EVENT_PRIORITIES,
} from "../src/PrimaryEventPriorities";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";

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

describe("buildEventQueryPlan", () => {
  it("priorities 를 생략하면 우선순위 필터 없이 최신순으로 조회한다", () => {
    const plan = buildEventQueryPlan("s1", 60);

    expect(plan.collectionPath).toBe("sessions/s1/events");
    expect(plan.priorities).toBeNull();
    expect(plan.orderByField).toBe("timestamp");
    expect(plan.isDescending).toBe(true);
    expect(plan.limit).toBe(60);
  });

  it("priorities 를 주면 쿼리에 우선순위 필터가 반영된다", () => {
    const plan = buildEventQueryPlan("s1", 20, PRIMARY_EVENT_PRIORITIES);

    expect(plan.priorities).toEqual([
      RaceEventPriority.Critical,
      RaceEventPriority.High,
    ]);
    // 필터를 걸어도 정렬·한도는 그대로 유지된다.
    expect(plan.orderByField).toBe("timestamp");
    expect(plan.isDescending).toBe(true);
    expect(plan.limit).toBe(20);
  });

  it("주요 우선순위는 Firestore in 연산자 한도 안에 들어간다", () => {
    expect(PRIMARY_EVENT_PRIORITIES.length).toBeLessThanOrEqual(
      FIRESTORE_IN_MAX_VALUES,
    );
  });

  it("빈 priorities 는 in 쿼리를 만들 수 없으므로 거부한다", () => {
    expect(() => buildEventQueryPlan("s1", 20, [])).toThrow();
  });

  it("in 연산자 한도를 넘는 priorities 는 거부한다", () => {
    const tooMany = Array.from(
      { length: FIRESTORE_IN_MAX_VALUES + 1 },
      () => RaceEventPriority.Low,
    );

    expect(() => buildEventQueryPlan("s1", 20, tooMany)).toThrow();
  });
});

describe("isPrimaryRaceEvent", () => {
  it("Critical / High 만 주요 이벤트로 본다", () => {
    const event = frame.events[0];

    expect(event).toBeDefined();

    const makeWithPriority = (priority: RaceEventPriority): RaceEvent => ({
      ...event!,
      priority,
    });

    expect(isPrimaryRaceEvent(makeWithPriority(RaceEventPriority.Critical))).toBe(true);
    expect(isPrimaryRaceEvent(makeWithPriority(RaceEventPriority.High))).toBe(true);
    expect(isPrimaryRaceEvent(makeWithPriority(RaceEventPriority.Medium))).toBe(false);
    expect(isPrimaryRaceEvent(makeWithPriority(RaceEventPriority.Low))).toBe(false);
  });
});
