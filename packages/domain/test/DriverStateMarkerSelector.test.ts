import { describe, expect, it } from "vitest";
import { DriverStateMarkerKind } from "../src/DriverStateMarkerKind";
import { selectDriverStateMarkers } from "../src/DriverStateMarkerSelector";
import { InvestigationStatus } from "../src/InvestigationStatus";
import { RaceEvent, RaceEventParams } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";

const BASE_MS = Date.parse("2026-07-19T12:00:00.000Z");

const makeEvent = (
  type: RaceEventType,
  offsetSeconds: number,
  driverNumber: number | undefined,
  params: RaceEventParams = {},
): RaceEvent => ({
  schemaVersion: 1,
  id: `${type}-${offsetSeconds}`,
  sessionId: "test",
  type,
  priority: RaceEventPriority.High,
  ...(driverNumber === undefined ? {} : { driverNumber }),
  timestamp: new Date(BASE_MS + offsetSeconds * 1000).toISOString(),
  params,
  deduplicationKey: `${type}-${offsetSeconds}`,
});

describe("selectDriverStateMarkers", () => {
  it("빈 배열이면 마커가 없다", () => {
    expect(selectDriverStateMarkers([]).size).toBe(0);
  });

  it("페널티가 드라이버 마커로 남는다", () => {
    const markers = selectDriverStateMarkers([
      makeEvent(RaceEventType.Penalty, 10, 44, { penaltySeconds: 5 }),
    ]);

    const driverMarkers = markers.get(44) ?? [];

    expect(driverMarkers).toHaveLength(1);
    expect(driverMarkers[0]?.kind).toBe(DriverStateMarkerKind.Penalty);
    expect(driverMarkers[0]?.penaltySeconds).toBe(5);
    expect(driverMarkers[0]?.penaltyCount).toBe(1);
  });

  it("같은 드라이버의 페널티가 누적된다", () => {
    const markers = selectDriverStateMarkers([
      makeEvent(RaceEventType.Penalty, 10, 44, { penaltySeconds: 5 }),
      makeEvent(RaceEventType.Penalty, 300, 44, { penaltySeconds: 10 }),
    ]);

    const marker = (markers.get(44) ?? [])[0];

    expect(marker?.penaltySeconds).toBe(15);
    expect(marker?.penaltyCount).toBe(2);
    // 마커가 처음 붙은 시각을 유지한다.
    expect(marker?.sinceTimestamp).toBe(
      new Date(BASE_MS + 10_000).toISOString(),
    );
  });

  it("초를 모르는 페널티는 penaltySeconds 가 null 이지만 건수는 센다", () => {
    const markers = selectDriverStateMarkers([
      makeEvent(RaceEventType.Penalty, 10, 44, { penaltySeconds: null }),
    ]);

    const marker = (markers.get(44) ?? [])[0];

    expect(marker?.penaltySeconds).toBeNull();
    expect(marker?.penaltyCount).toBe(1);
  });

  it("페널티는 세션 종료 이벤트가 와도 유지된다", () => {
    const markers = selectDriverStateMarkers([
      makeEvent(RaceEventType.Penalty, 10, 44, { penaltySeconds: 5 }),
      makeEvent(RaceEventType.ChequeredFlag, 900, undefined),
    ]);

    expect(markers.get(44)).toHaveLength(1);
  });

  it("조사 중이면 마커가 활성이다", () => {
    const markers = selectDriverStateMarkers([
      makeEvent(RaceEventType.Investigation, 10, 16, {
        status: InvestigationStatus.UnderInvestigation,
      }),
    ]);

    const marker = (markers.get(16) ?? [])[0];

    expect(marker?.kind).toBe(DriverStateMarkerKind.Investigation);
    expect(marker?.investigationStatus).toBe(
      InvestigationStatus.UnderInvestigation,
    );
  });

  it("noted 도 종결이 아니므로 마커가 유지된다", () => {
    const markers = selectDriverStateMarkers([
      makeEvent(RaceEventType.Investigation, 10, 16, {
        status: InvestigationStatus.Noted,
      }),
    ]);

    expect(markers.get(16)).toHaveLength(1);
  });

  it("조사가 concluded 되면 마커가 제거된다", () => {
    const markers = selectDriverStateMarkers([
      makeEvent(RaceEventType.Investigation, 10, 16, {
        status: InvestigationStatus.UnderInvestigation,
      }),
      makeEvent(RaceEventType.Investigation, 200, 16, {
        status: InvestigationStatus.Concluded,
      }),
    ]);

    expect(markers.get(16)).toBeUndefined();
  });

  it("페널티와 조사가 함께 있으면 페널티가 앞에 온다", () => {
    const markers = selectDriverStateMarkers([
      makeEvent(RaceEventType.Investigation, 10, 44, {
        status: InvestigationStatus.UnderInvestigation,
      }),
      makeEvent(RaceEventType.Penalty, 20, 44, { penaltySeconds: 5 }),
    ]);

    const driverMarkers = markers.get(44) ?? [];

    expect(driverMarkers.map((marker) => marker.kind)).toEqual([
      DriverStateMarkerKind.Penalty,
      DriverStateMarkerKind.Investigation,
    ]);
  });

  it("Retirement 는 마커를 만들지 않는다", () => {
    const markers = selectDriverStateMarkers([
      makeEvent(RaceEventType.Retirement, 10, 55, { reason: "engine" }),
    ]);

    expect(markers.size).toBe(0);
  });

  it("이벤트가 뒤섞여 들어와도 정렬 후 접힌다", () => {
    const markers = selectDriverStateMarkers([
      makeEvent(RaceEventType.Investigation, 200, 16, {
        status: InvestigationStatus.Concluded,
      }),
      makeEvent(RaceEventType.Investigation, 10, 16, {
        status: InvestigationStatus.UnderInvestigation,
      }),
    ]);

    expect(markers.get(16)).toBeUndefined();
  });

  it("atMs 이전 이벤트만 반영한다", () => {
    const events = [
      makeEvent(RaceEventType.Investigation, 10, 16, {
        status: InvestigationStatus.UnderInvestigation,
      }),
      makeEvent(RaceEventType.Investigation, 200, 16, {
        status: InvestigationStatus.Concluded,
      }),
    ];

    expect(selectDriverStateMarkers(events, BASE_MS + 60_000).get(16)).toHaveLength(1);
    expect(selectDriverStateMarkers(events, BASE_MS + 300_000).get(16)).toBeUndefined();
  });

  it("driverNumber 가 없는 이벤트는 무시한다", () => {
    const markers = selectDriverStateMarkers([
      makeEvent(RaceEventType.Penalty, 10, undefined, { penaltySeconds: 5 }),
    ]);

    expect(markers.size).toBe(0);
  });

  it("조사 상태를 알 수 없으면 마커를 만들지 않는다", () => {
    const markers = selectDriverStateMarkers([
      makeEvent(RaceEventType.Investigation, 10, 16, { status: "weird" }),
    ]);

    expect(markers.size).toBe(0);
  });
});
