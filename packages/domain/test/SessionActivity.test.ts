import { describe, expect, it } from "vitest";
import {
  resolveSessionActivity,
  SESSION_GRACE_MS,
  SESSION_MAX_DURATION_MS,
  SESSION_PRE_ROLL_MS,
} from "../src/worker/SessionActivity";
import { SessionActivityReason } from "../src/worker/SessionActivityReason";

// 워커는 기동하자마자 이 판정을 먼저 한다. 비활성이면 Firestore 를 한 번도
// 건드리지 않으므로, 여기가 틀리면 곧바로 비용이거나 데이터 누락이다.

const START = Date.parse("2026-07-19T13:00:00.000Z");
const END = Date.parse("2026-07-19T15:00:00.000Z");

const META = {
  dateStart: new Date(START).toISOString(),
  dateEnd: new Date(END).toISOString(),
};

describe("세션 활성 판정", () => {
  it("세션 진행 중이면 활성이다", () => {
    const activity = resolveSessionActivity(META, {
      nowMs: START + 60 * 60 * 1000,
    });

    expect(activity.isActive).toBe(true);
    expect(activity.reason).toBe(SessionActivityReason.Active);
  });

  it("시작 한참 전이면 비활성이다", () => {
    const activity = resolveSessionActivity(META, {
      nowMs: START - 6 * 60 * 60 * 1000,
    });

    expect(activity.isActive).toBe(false);
    expect(activity.reason).toBe(SessionActivityReason.BeforeStart);
  });

  it("pre-roll 안이면 시작 전이라도 활성이다", () => {
    const activity = resolveSessionActivity(META, {
      nowMs: START - SESSION_PRE_ROLL_MS + 1000,
    });

    expect(activity.isActive).toBe(true);
  });

  it("종료 직후 grace 안이면 아직 활성이다", () => {
    // session_result 와 늦게 올라오는 team_radio 를 받기 위한 여유.
    const activity = resolveSessionActivity(META, {
      nowMs: END + SESSION_GRACE_MS - 1000,
    });

    expect(activity.isActive).toBe(true);
    expect(activity.reason).toBe(SessionActivityReason.Active);
  });

  it("grace 를 넘기면 비활성이다", () => {
    const activity = resolveSessionActivity(META, {
      nowMs: END + SESSION_GRACE_MS + 1000,
    });

    expect(activity.isActive).toBe(false);
    expect(activity.reason).toBe(SessionActivityReason.AfterEnd);
  });

  it("레이스가 없는 평일에는 비활성이다", () => {
    // session_key=latest 는 세션이 없어도 마지막으로 끝난 세션을 돌려준다.
    const activity = resolveSessionActivity(META, {
      nowMs: END + 5 * 24 * 60 * 60 * 1000,
    });

    expect(activity.isActive).toBe(false);
    expect(activity.reason).toBe(SessionActivityReason.AfterEnd);
  });

  it("date_end 가 없으면 최대 세션 길이를 가정해 판정한다", () => {
    const meta = { dateStart: META.dateStart, dateEnd: null };

    expect(
      resolveSessionActivity(meta, {
        nowMs: START + SESSION_MAX_DURATION_MS - 1000,
      }).isActive,
    ).toBe(true);
    expect(
      resolveSessionActivity(meta, {
        nowMs: START + SESSION_MAX_DURATION_MS + SESSION_GRACE_MS + 1000,
      }).isActive,
    ).toBe(false);
  });

  it("date_start 가 없으면 비용 가드로 비활성으로 닫는다", () => {
    const activity = resolveSessionActivity(
      { dateStart: null, dateEnd: null },
      { nowMs: START },
    );

    expect(activity.isActive).toBe(false);
    expect(activity.reason).toBe(SessionActivityReason.UnknownSchedule);
    expect(activity.windowStartMs).toBeNull();
  });

  it("파싱할 수 없는 시각도 비활성으로 닫는다", () => {
    const activity = resolveSessionActivity(
      { dateStart: "not-a-date", dateEnd: "also-not" },
      { nowMs: START },
    );

    expect(activity.reason).toBe(SessionActivityReason.UnknownSchedule);
  });
});
