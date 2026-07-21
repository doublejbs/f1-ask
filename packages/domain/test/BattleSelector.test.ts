import { describe, expect, it } from "vitest";
import {
  BATTLE_GAP_THRESHOLD_SECONDS,
  OVERRIDE_RANGE_THRESHOLD_SECONDS,
  selectBattles,
} from "../src/BattleSelector";
import { LiveDriverState } from "../src/LiveDriverState";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { SessionStatus } from "../src/SessionStatus";
import { TireCompound } from "../src/TireCompound";

// 배틀 판정에 필요한 필드만 지정하고 나머지는 기본값으로 채우는 드라이버 팩토리.
const makeDriver = (
  overrides: Partial<LiveDriverState> & { position: number | null },
): LiveDriverState => ({
  driverNumber: overrides.position ?? 0,
  code: `D${overrides.position ?? 0}`,
  fullName: "Test Driver",
  teamName: "Test Team",
  startingPosition: overrides.position,
  positionChange: 0,
  gapToLeaderSeconds: null,
  intervalToAheadSeconds: null,
  intervalToBehindSeconds: null,
  lastLapSeconds: null,
  personalBestLapSeconds: null,
  compound: TireCompound.Medium,
  tireAgeLaps: null,
  pitStopCount: 0,
  inPit: false,
  retired: false,
  recentLapTimesSeconds: [],
  ...overrides,
});

const makeSnapshot = (drivers: LiveDriverState[]): LiveRaceSnapshot => ({
  schemaVersion: 1,
  sessionId: "test",
  sessionKey: 1,
  meetingKey: 1,
  sessionName: "Race",
  sessionType: "Race",
  circuitName: "Test Circuit",
  countryCode: "TST",
  status: SessionStatus.Green,
  currentLap: 10,
  totalLaps: 50,
  drivers,
  generatedAt: "2026-07-19T05:00:00.000Z",
  sourceUpdatedAt: "2026-07-19T05:00:00.000Z",
  version: 1,
});

describe("selectBattles", () => {
  it("빈 드라이버 배열이면 빈 배열을 반환한다", () => {
    expect(selectBattles(makeSnapshot([]), 3)).toEqual([]);
  });

  it("간격이 좁은 순으로 정렬하고 limit 을 지킨다", () => {
    const snapshot = makeSnapshot([
      makeDriver({ position: 1, code: "AAA" }),
      makeDriver({ position: 2, code: "BBB", intervalToAheadSeconds: 1.2 }),
      makeDriver({ position: 3, code: "CCC", intervalToAheadSeconds: 0.4 }),
      makeDriver({ position: 4, code: "DDD", intervalToAheadSeconds: 0.9 }),
    ]);

    const battles = selectBattles(snapshot, 2);

    expect(battles.length).toBe(2);
    // 0.4(CCC↔) < 0.9(DDD↔) 순, 1.2 는 limit 밖으로 밀린다.
    expect(battles[0]?.chasingDriver.code).toBe("CCC");
    expect(battles[0]?.aheadDriver.code).toBe("BBB");
    expect(battles[0]?.gapSeconds).toBe(0.4);
    expect(battles[1]?.chasingDriver.code).toBe("DDD");
  });

  it("1.5초 경계: 1.5 는 제외하고 1.49 는 포함한다", () => {
    const snapshot = makeSnapshot([
      makeDriver({ position: 1, code: "AAA" }),
      makeDriver({
        position: 2,
        code: "BBB",
        intervalToAheadSeconds: BATTLE_GAP_THRESHOLD_SECONDS,
      }),
      makeDriver({ position: 3, code: "CCC", intervalToAheadSeconds: 1.49 }),
    ]);

    const battles = selectBattles(snapshot, 5);

    expect(battles.length).toBe(1);
    expect(battles[0]?.chasingDriver.code).toBe("CCC");
  });

  it("오버라이드 사정권 판정 경계: 0.99 는 사정권, 1.0 은 사정권이 아니다", () => {
    const snapshot = makeSnapshot([
      makeDriver({ position: 1, code: "AAA" }),
      makeDriver({ position: 2, code: "BBB", intervalToAheadSeconds: 0.99 }),
      makeDriver({
        position: 3,
        code: "CCC",
        intervalToAheadSeconds: OVERRIDE_RANGE_THRESHOLD_SECONDS,
      }),
    ]);

    const battles = selectBattles(snapshot, 5);
    const bbb = battles.find((battle) => battle.chasingDriver.code === "BBB");
    const ccc = battles.find((battle) => battle.chasingDriver.code === "CCC");

    expect(bbb?.isOverrideRange).toBe(true);
    expect(ccc?.isOverrideRange).toBe(false);
  });

  it("리타이어·피트인 드라이버가 낀 쌍은 제외한다", () => {
    const snapshot = makeSnapshot([
      makeDriver({ position: 1, code: "AAA" }),
      makeDriver({ position: 2, code: "BBB", intervalToAheadSeconds: 0.5 }),
      makeDriver({ position: 3, code: "CCC", intervalToAheadSeconds: 0.6 }),
      makeDriver({
        position: 4,
        code: "DDD",
        intervalToAheadSeconds: 0.7,
        retired: true,
      }),
      makeDriver({ position: 5, code: "EEE", intervalToAheadSeconds: 0.8 }),
      makeDriver({
        position: 6,
        code: "FFF",
        intervalToAheadSeconds: 0.9,
        inPit: true,
      }),
    ]);

    const battles = selectBattles(snapshot, 5);
    const codes = battles.map((battle) => battle.chasingDriver.code);

    // DDD(리타이어) 가 낀 CCC↔DDD·DDD↔EEE, FFF(피트인) 가 낀 EEE↔FFF 는 제외.
    // 깨끗한 인접 쌍 AAA↔BBB, BBB↔CCC 만 남는다.
    expect(codes).toEqual(["BBB", "CCC"]);
  });

  it("intervalToAheadSeconds 가 null 인 쌍은 무시한다", () => {
    const snapshot = makeSnapshot([
      makeDriver({ position: 1, code: "AAA" }),
      makeDriver({ position: 2, code: "BBB", intervalToAheadSeconds: null }),
      makeDriver({ position: 3, code: "CCC", intervalToAheadSeconds: 0.6 }),
    ]);

    const battles = selectBattles(snapshot, 5);

    expect(battles.length).toBe(1);
    expect(battles[0]?.chasingDriver.code).toBe("CCC");
  });

  it("position 이 null 인 드라이버는 순위 계산에서 제외한다", () => {
    const snapshot = makeSnapshot([
      makeDriver({ position: null, code: "OUT", intervalToAheadSeconds: 0.1 }),
      makeDriver({ position: 1, code: "AAA" }),
      makeDriver({ position: 2, code: "BBB", intervalToAheadSeconds: 0.6 }),
    ]);

    const battles = selectBattles(snapshot, 5);

    expect(battles.length).toBe(1);
    expect(battles[0]?.aheadDriver.code).toBe("AAA");
    expect(battles[0]?.chasingDriver.code).toBe("BBB");
  });

  it("포지션에 구멍이 있으면(P1·P3, P2 부재) 인접 쌍으로 보지 않는다", () => {
    const snapshot = makeSnapshot([
      makeDriver({ position: 1, code: "AAA" }),
      makeDriver({ position: 3, code: "CCC", intervalToAheadSeconds: 0.4 }),
    ]);

    // P3 의 interval 이 접전 범위여도 앞이 P1 이라 인접하지 않으므로 배틀이 아니다.
    expect(selectBattles(snapshot, 5)).toEqual([]);
  });

  it("1.2초 쌍은 배틀이지만 오버라이드 사정권은 아니다", () => {
    const snapshot = makeSnapshot([
      makeDriver({ position: 1, code: "AAA" }),
      makeDriver({ position: 2, code: "BBB", intervalToAheadSeconds: 1.2 }),
    ]);

    const battles = selectBattles(snapshot, 5);

    expect(battles.length).toBe(1);
    expect(battles[0]?.isOverrideRange).toBe(false);
  });

  it("limit 이 0 이면 빈 배열을 반환한다", () => {
    const snapshot = makeSnapshot([
      makeDriver({ position: 1, code: "AAA" }),
      makeDriver({ position: 2, code: "BBB", intervalToAheadSeconds: 0.6 }),
    ]);

    expect(selectBattles(snapshot, 0)).toEqual([]);
  });
});
