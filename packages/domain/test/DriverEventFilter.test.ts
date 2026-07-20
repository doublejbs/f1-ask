import { describe, expect, it } from "vitest";
import {
  filterEventsByDriver,
  matchesDriverEvent,
} from "../src/DriverEventFilter";
import { RaceEvent, RaceEventParams } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";

type EventOverrides = {
  id: string;
  driverNumber?: number;
  targetDriverNumber?: number;
  params?: RaceEventParams;
};

const buildEvent = ({
  id,
  driverNumber,
  targetDriverNumber,
  params = {},
}: EventOverrides): RaceEvent => ({
  schemaVersion: 1,
  id,
  sessionId: "session-1",
  type: RaceEventType.Investigation,
  priority: RaceEventPriority.High,
  ...(driverNumber === undefined ? {} : { driverNumber }),
  ...(targetDriverNumber === undefined ? {} : { targetDriverNumber }),
  timestamp: "2026-07-19T05:00:00.000Z",
  params,
  deduplicationKey: id,
});

describe("matchesDriverEvent", () => {
  it("driverNumber 가 일치하면 매칭된다", () => {
    const event = buildEvent({ id: "a", driverNumber: 44 });

    expect(matchesDriverEvent(event, 44, "HAM")).toBe(true);
  });

  it("targetDriverNumber 가 일치하면 매칭된다", () => {
    const event = buildEvent({ id: "a", driverNumber: 1, targetDriverNumber: 44 });

    expect(matchesDriverEvent(event, 44, "HAM")).toBe(true);
  });

  it("params.driverCode 가 일치하면 매칭된다", () => {
    const event = buildEvent({ id: "a", params: { driverCode: "HAM" } });

    expect(matchesDriverEvent(event, 999, "HAM")).toBe(true);
  });

  it("params.targetDriverCode 가 일치하면 매칭된다", () => {
    const event = buildEvent({ id: "a", params: { targetDriverCode: "HAM" } });

    expect(matchesDriverEvent(event, 999, "HAM")).toBe(true);
  });

  it("driverCodes 다중 차량에서 각 차량이 모두 매칭된다", () => {
    const event = buildEvent({ id: "a", params: { driverCodes: "HAM,RUS" } });

    expect(matchesDriverEvent(event, 999, "HAM")).toBe(true);
    expect(matchesDriverEvent(event, 999, "RUS")).toBe(true);
  });

  it("driverCodes 항목의 공백을 무시하고 매칭한다", () => {
    const event = buildEvent({ id: "a", params: { driverCodes: "LEC, PIA" } });

    expect(matchesDriverEvent(event, 999, "PIA")).toBe(true);
  });

  it("driverCodes 부분 문자열로는 매칭되지 않는다", () => {
    const event = buildEvent({ id: "a", params: { driverCodes: "HAM,RUS" } });

    expect(matchesDriverEvent(event, 999, "HA")).toBe(false);
    expect(matchesDriverEvent(event, 999, "HAMX")).toBe(false);
    expect(matchesDriverEvent(event, 999, "AM,RU")).toBe(false);
  });

  it("driverCode 를 주지 않으면 번호로만 판정한다", () => {
    const event = buildEvent({ id: "a", params: { driverCodes: "HAM,RUS" } });

    expect(matchesDriverEvent(event, 999)).toBe(false);
    expect(matchesDriverEvent(buildEvent({ id: "b", driverNumber: 63 }), 63)).toBe(
      true,
    );
  });

  it("문자열이 아닌 params 값은 코드로 취급하지 않는다", () => {
    const event = buildEvent({ id: "a", params: { driverCode: 44, driverCodes: null } });

    expect(matchesDriverEvent(event, 999, "44")).toBe(false);
  });
});

describe("filterEventsByDriver", () => {
  it("빈 배열은 빈 배열을 반환한다", () => {
    expect(filterEventsByDriver([], 44, "HAM")).toEqual([]);
  });

  it("매칭이 없으면 빈 배열을 반환한다", () => {
    const events = [
      buildEvent({ id: "a", driverNumber: 1, params: { driverCode: "VER" } }),
      buildEvent({ id: "b", params: { driverCodes: "LEC,PIA" } }),
    ];

    expect(filterEventsByDriver(events, 44, "HAM")).toEqual([]);
  });

  it("세 경로가 섞여 있어도 모두 골라내며 원본 순서를 보존한다", () => {
    const events = [
      buildEvent({ id: "a", driverNumber: 44 }),
      buildEvent({ id: "b", driverNumber: 1, params: { driverCode: "VER" } }),
      buildEvent({ id: "c", params: { driverCodes: "HAM,RUS" } }),
      buildEvent({ id: "d", targetDriverNumber: 44 }),
      buildEvent({ id: "e", params: { targetDriverCode: "HAM" } }),
    ];

    expect(filterEventsByDriver(events, 44, "HAM").map((event) => event.id)).toEqual(
      ["a", "c", "d", "e"],
    );
  });

  it("다중 차량 인시던트는 양쪽 드라이버 필터에 모두 잡힌다", () => {
    const events = [
      buildEvent({
        id: "incident",
        driverNumber: 16,
        params: { driverCodes: "LEC,PIA" },
      }),
    ];

    expect(filterEventsByDriver(events, 16, "LEC").map((event) => event.id)).toEqual([
      "incident",
    ]);
    expect(filterEventsByDriver(events, 81, "PIA").map((event) => event.id)).toEqual([
      "incident",
    ]);
  });
});
