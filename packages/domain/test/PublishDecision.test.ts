import { describe, expect, it } from "vitest";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { SessionStatus } from "../src/SessionStatus";
import { TireCompound } from "../src/TireCompound";
import {
  decidePublish,
  EMPTY_PUBLISH_STATE,
  SNAPSHOT_HEARTBEAT_MS,
} from "../src/worker/PublishDecision";
import { FRESHNESS_DELAYED_MAX_MS } from "../src/Freshness";

const NOW = Date.parse("2026-07-19T13:00:00.000Z");

const makeSnapshot = (
  overrides: Partial<LiveRaceSnapshot> = {},
): LiveRaceSnapshot => ({
  schemaVersion: 1,
  sessionId: "test-session",
  sessionKey: 1,
  meetingKey: 1,
  sessionName: "Race",
  sessionType: "Race",
  circuitName: "Test",
  countryCode: "TS",
  status: SessionStatus.Green,
  currentLap: 10,
  totalLaps: 50,
  drivers: [],
  generatedAt: new Date(NOW).toISOString(),
  sourceUpdatedAt: new Date(NOW).toISOString(),
  version: 0,
  ...overrides,
});

describe("스냅샷 / 세션 문서 쓰기 판정", () => {
  it("첫 폴링에서는 둘 다 쓴다", () => {
    const decision = decidePublish(makeSnapshot(), EMPTY_PUBLISH_STATE, {
      nowMs: NOW,
    });

    expect(decision.shouldWriteSnapshot).toBe(true);
    expect(decision.shouldWriteSessionDoc).toBe(true);
  });

  it("내용이 그대로면 heartbeat 전까지 스냅샷을 건너뛴다", () => {
    const first = decidePublish(makeSnapshot(), EMPTY_PUBLISH_STATE, {
      nowMs: NOW,
    });
    // generatedAt / sourceUpdatedAt / version 만 달라진 것은 "변화"가 아니다.
    const second = decidePublish(
      makeSnapshot({
        version: 1,
        generatedAt: new Date(NOW + 6000).toISOString(),
        sourceUpdatedAt: new Date(NOW + 6000).toISOString(),
      }),
      first.nextState,
      { nowMs: NOW + 6000 },
    );

    expect(second.shouldWriteSnapshot).toBe(false);
    expect(second.shouldWriteSessionDoc).toBe(false);
  });

  it("heartbeat 주기가 지나면 내용이 같아도 쓴다", () => {
    const first = decidePublish(makeSnapshot(), EMPTY_PUBLISH_STATE, {
      nowMs: NOW,
    });
    const later = decidePublish(makeSnapshot(), first.nextState, {
      nowMs: NOW + SNAPSHOT_HEARTBEAT_MS,
    });

    expect(later.shouldWriteSnapshot).toBe(true);
  });

  it("heartbeat 이 freshness Stale 기준보다 짧다", () => {
    // 조용한 구간에서 쓰기를 아끼더라도 화면이 Stale 로 떨어지면 안 된다.
    expect(SNAPSHOT_HEARTBEAT_MS).toBeLessThan(FRESHNESS_DELAYED_MAX_MS);
  });

  it("경기 상태가 움직이면 스냅샷을 쓴다", () => {
    const first = decidePublish(makeSnapshot(), EMPTY_PUBLISH_STATE, {
      nowMs: NOW,
    });
    const moved = decidePublish(
      makeSnapshot({ currentLap: 11 }),
      first.nextState,
      { nowMs: NOW + 6000 },
    );

    expect(moved.shouldWriteSnapshot).toBe(true);
    expect(moved.shouldWriteSessionDoc).toBe(true);
  });

  it("드라이버 상태만 바뀌면 스냅샷만 쓰고 세션 문서는 건너뛴다", () => {
    const first = decidePublish(makeSnapshot(), EMPTY_PUBLISH_STATE, {
      nowMs: NOW,
    });
    const second = decidePublish(
      makeSnapshot({
        drivers: [
          {
            driverNumber: 1,
            code: "VER",
            fullName: "Max Verstappen",
            teamName: "Red Bull Racing",
            position: 1,
            startingPosition: 1,
            positionChange: 0,
            gapToLeaderSeconds: 0,
            intervalToAheadSeconds: null,
            intervalToBehindSeconds: 1.2,
            lastLapSeconds: 90,
            personalBestLapSeconds: 89,
            compound: TireCompound.Medium,
            tireAgeLaps: 5,
            pitStopCount: 0,
            inPit: false,
            retired: false,
            recentLapTimesSeconds: [90],
          },
        ],
      }),
      first.nextState,
      { nowMs: NOW + 6000 },
    );

    expect(second.shouldWriteSnapshot).toBe(true);
    expect(second.shouldWriteSessionDoc).toBe(false);
  });
});
