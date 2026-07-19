import { describe, expect, it } from "vitest";
import {
  selectFavoriteDriverDetail,
  selectFavoriteDriverEvents,
} from "../src/FavoriteDriverDetail";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { RaceEventType } from "../src/RaceEventType";

const START_EPOCH = Date.parse("2026-07-19T05:00:00.000Z");

const snapshotAt = (elapsedSeconds: number) =>
  new MockRaceEngine(DEFAULT_MOCK_SCENARIO, START_EPOCH).snapshotAt(
    elapsedSeconds,
  );

describe("selectFavoriteDriverDetail", () => {
  it("snapshot 에 있는 드라이버의 상세 모델을 만든다", () => {
    const { snapshot, events } = snapshotAt(122);
    const detail = selectFavoriteDriverDetail(snapshot, events, 4);

    expect(detail).not.toBeNull();
    expect(detail?.code).toBe("NOR");
    expect(detail?.driverNumber).toBe(4);
  });

  it("존재하지 않는 드라이버는 null 을 반환한다", () => {
    const { snapshot, events } = snapshotAt(10);

    expect(selectFavoriteDriverDetail(snapshot, events, 999)).toBeNull();
  });

  it("앞차/뒤차 간격을 interval 필드에서 투영한다", () => {
    const { snapshot, events } = snapshotAt(50);
    const leader = snapshot.drivers.find((d) => d.position === 1);
    const detail = selectFavoriteDriverDetail(
      snapshot,
      events,
      leader?.driverNumber ?? 0,
    );

    // 리더는 앞차 간격이 없다.
    expect(detail?.gapAheadSeconds).toBeNull();
    expect(detail?.gapBehindSeconds).not.toBeNull();
  });

  it("recentEvents 는 해당 드라이버가 주체이거나 대상인 이벤트만 포함한다", () => {
    const { snapshot, events } = snapshotAt(122);
    const detail = selectFavoriteDriverDetail(snapshot, events, 4);

    expect(detail?.recentEvents.length).toBeGreaterThan(0);

    for (const event of detail?.recentEvents ?? []) {
      const isRelated =
        event.driverNumber === 4 || event.targetDriverNumber === 4;

      expect(isRelated).toBe(true);
    }
  });

  it("recentEvents 는 최신순으로 정렬되고 limit 을 지킨다", () => {
    const { events } = snapshotAt(122);
    const recent = selectFavoriteDriverEvents(events, 4, 2);

    expect(recent.length).toBeLessThanOrEqual(2);

    if (recent.length === 2) {
      const [first, second] = recent;
      const firstMs = Date.parse(first?.timestamp ?? "");
      const secondMs = Date.parse(second?.timestamp ?? "");

      expect(firstMs).toBeGreaterThanOrEqual(secondMs);
    }
  });

  it("추월 대상(target)으로 등장한 이벤트도 포함한다", () => {
    // NOR(4) 가 PER(11) 를 t=8 에 추월 → PER 입장에서도 관련 이벤트다.
    const { events } = snapshotAt(20);
    const perEvents = selectFavoriteDriverEvents(events, 11);

    expect(
      perEvents.some((event) => event.type === RaceEventType.Overtake),
    ).toBe(true);
  });
});
