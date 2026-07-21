import { describe, expect, it } from "vitest";
import { RaceEvent, RaceEventParams } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import {
  DEFAULT_RECENT_DRIVER_EVENT_WINDOW_MS,
  selectRecentDriverEvents,
} from "../src/RecentDriverEventSelector";

const BASE_MS = Date.parse("2026-07-19T12:00:00.000Z");

const makeEvent = (
  type: RaceEventType,
  offsetSeconds: number,
  driverNumber: number | undefined,
  params: RaceEventParams = {},
): RaceEvent => ({
  schemaVersion: 1,
  id: `${type}-${offsetSeconds}-${driverNumber ?? "none"}`,
  sessionId: "test",
  type,
  priority: RaceEventPriority.Medium,
  ...(driverNumber === undefined ? {} : { driverNumber }),
  timestamp: new Date(BASE_MS + offsetSeconds * 1000).toISOString(),
  params,
  deduplicationKey: `${type}-${offsetSeconds}-${driverNumber ?? "none"}`,
});

describe("selectRecentDriverEvents", () => {
  it("빈 배열이면 결과가 없다", () => {
    expect(selectRecentDriverEvents([], BASE_MS).size).toBe(0);
  });

  it("창 안의 순간 이벤트를 드라이버별로 돌려준다", () => {
    const recent = selectRecentDriverEvents(
      [
        makeEvent(RaceEventType.Overtake, 0, 44),
        makeEvent(RaceEventType.PitStop, 5, 1),
      ],
      BASE_MS + 10_000,
    );

    expect(recent.get(44)?.type).toBe(RaceEventType.Overtake);
    expect(recent.get(1)?.type).toBe(RaceEventType.PitStop);
  });

  it("창 밖의 이벤트는 제외한다", () => {
    const recent = selectRecentDriverEvents(
      [makeEvent(RaceEventType.Overtake, 0, 44)],
      BASE_MS + DEFAULT_RECENT_DRIVER_EVENT_WINDOW_MS,
    );

    expect(recent.size).toBe(0);
  });

  it("경계 직전이면 포함된다", () => {
    const recent = selectRecentDriverEvents(
      [makeEvent(RaceEventType.Overtake, 0, 44)],
      BASE_MS + DEFAULT_RECENT_DRIVER_EVENT_WINDOW_MS - 1,
    );

    expect(recent.get(44)?.type).toBe(RaceEventType.Overtake);
  });

  it("드라이버별로 창 안의 최신 1건만 남긴다", () => {
    const recent = selectRecentDriverEvents(
      [
        makeEvent(RaceEventType.Overtake, 0, 44),
        makeEvent(RaceEventType.PitStop, 5, 44),
        makeEvent(RaceEventType.FastestLap, 3, 44),
      ],
      BASE_MS + 10_000,
    );

    expect(recent.size).toBe(1);
    expect(recent.get(44)?.type).toBe(RaceEventType.PitStop);
  });

  it("입력 순서가 뒤섞여도 최신 1건을 고른다", () => {
    const recent = selectRecentDriverEvents(
      [
        makeEvent(RaceEventType.PitStop, 5, 44),
        makeEvent(RaceEventType.Overtake, 0, 44),
      ],
      BASE_MS + 10_000,
    );

    expect(recent.get(44)?.type).toBe(RaceEventType.PitStop);
  });

  it("미래 이벤트는 제외한다 — 경기 시계 기준으로 판정한다", () => {
    const recent = selectRecentDriverEvents(
      [makeEvent(RaceEventType.Overtake, 60, 44)],
      BASE_MS + 10_000,
    );

    expect(recent.size).toBe(0);
  });

  it("TeamRadioPosted 는 라디오 인디케이터가 있으므로 잡지 않는다", () => {
    const recent = selectRecentDriverEvents(
      [makeEvent(RaceEventType.TeamRadioPosted, 0, 44)],
      BASE_MS + 1_000,
    );

    expect(recent.size).toBe(0);
  });

  it("GapClosing / OverrideRangeEntered 는 배틀 인라인이 있으므로 잡지 않는다", () => {
    const recent = selectRecentDriverEvents(
      [
        makeEvent(RaceEventType.GapClosing, 0, 44),
        makeEvent(RaceEventType.OverrideRangeEntered, 1, 1),
      ],
      BASE_MS + 2_000,
    );

    expect(recent.size).toBe(0);
  });

  it("지속 상태(Penalty / Retirement)는 순간 이벤트가 아니다", () => {
    const recent = selectRecentDriverEvents(
      [
        makeEvent(RaceEventType.Penalty, 0, 44, { penaltySeconds: 5 }),
        makeEvent(RaceEventType.Retirement, 1, 55),
      ],
      BASE_MS + 2_000,
    );

    expect(recent.size).toBe(0);
  });

  it("세션 이벤트는 잡지 않는다", () => {
    const recent = selectRecentDriverEvents(
      [makeEvent(RaceEventType.SafetyCar, 0, undefined)],
      BASE_MS + 1_000,
    );

    expect(recent.size).toBe(0);
  });

  it("창 길이를 직접 줄 수 있다", () => {
    const events = [makeEvent(RaceEventType.Overtake, 0, 44)];

    expect(selectRecentDriverEvents(events, BASE_MS + 5_000, 3_000).size).toBe(0);
    expect(
      selectRecentDriverEvents(events, BASE_MS + 5_000, 10_000).get(44)?.type,
    ).toBe(RaceEventType.Overtake);
  });

  it("창 길이가 0 이하면 아무것도 돌려주지 않는다", () => {
    const recent = selectRecentDriverEvents(
      [makeEvent(RaceEventType.Overtake, 0, 44)],
      BASE_MS,
      0,
    );

    expect(recent.size).toBe(0);
  });

  it("timestamp 를 파싱할 수 없는 이벤트는 무시한다", () => {
    const broken: RaceEvent = {
      ...makeEvent(RaceEventType.Overtake, 0, 44),
      timestamp: "not-a-date",
    };

    expect(selectRecentDriverEvents([broken], BASE_MS).size).toBe(0);
  });
});
