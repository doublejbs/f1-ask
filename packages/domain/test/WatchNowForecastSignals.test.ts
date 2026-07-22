import { describe, expect, it } from "vitest";
import { LiveDriverState } from "../src/LiveDriverState";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { OvertakeForecast } from "../src/openf1/OvertakeForecast";
import { SessionStatus } from "../src/SessionStatus";
import { TireCompound } from "../src/TireCompound";
import { WatchNowFeed } from "../src/watchnow/WatchNowFeed";
import { buildOvertakeForecastSignals } from "../src/watchnow/WatchNowForecastSignals";
import { WatchNowLane } from "../src/watchnow/WatchNowLane";
import {
  buildWatchNowLanes,
  WatchNowLaneGroup,
} from "../src/watchnow/WatchNowLaneBuilder";
import { DEFAULT_WATCH_NOW_LANE_CONFIG } from "../src/watchnow/WatchNowLaneConfig";
import { WatchNowSignal } from "../src/watchnow/WatchNowSignal";
import { WatchNowSignalType } from "../src/watchnow/WatchNowSignalType";

// docs/23 §UI — 워커가 스냅샷에 실은 예측을 "지금 볼 것" 신호로 변환하고, 기존 칸 규칙
// (chaser 순위 기준·즐겨찾기)에 태우는 것을 고정한다.

const BASE_TIME_MS = Date.parse("2026-07-27T13:00:00.000Z");

const createDriver = (
  driverNumber: number,
  position: number,
): LiveDriverState => ({
  driverNumber,
  code: `D${driverNumber}`,
  fullName: `Driver ${driverNumber}`,
  teamName: "Team",
  position,
  startingPosition: position,
  positionChange: 0,
  gapToLeaderSeconds: null,
  intervalToAheadSeconds: null,
  intervalToBehindSeconds: null,
  lastLapSeconds: null,
  personalBestLapSeconds: null,
  compound: TireCompound.Hard,
  tireAgeLaps: 10,
  pitStopCount: 0,
  inPit: false,
  retired: false,
  recentLapTimesSeconds: [],
});

const createForecast = (
  chaserNumber: number,
  targetNumber: number,
  predictedLapsToBattle: number,
): OvertakeForecast => ({
  chaserNumber,
  targetNumber,
  intervalSeconds: 2.4,
  closingRateSecondsPerLap: 0.4,
  predictedLapsToBattle,
  predictedLap: 20 + predictedLapsToBattle,
});

const createSnapshot = (
  drivers: LiveDriverState[],
  overtakeForecasts?: OvertakeForecast[],
): LiveRaceSnapshot => {
  const iso = new Date(BASE_TIME_MS).toISOString();

  return {
    schemaVersion: 1,
    sessionId: "session:forecast",
    sessionKey: 1,
    meetingKey: 1,
    sessionName: "Race",
    sessionType: "Race",
    circuitName: "Spa-Francorchamps",
    countryCode: "BEL",
    status: SessionStatus.Green,
    currentLap: 20,
    totalLaps: 44,
    drivers,
    generatedAt: iso,
    sourceUpdatedAt: iso,
    version: 1,
    overtakeForecasts,
  };
};

const findLane = (
  lanes: WatchNowLaneGroup[],
  lane: WatchNowLane,
): WatchNowLaneGroup => {
  const found = lanes.find((group) => group.lane === lane);

  if (found === undefined) {
    throw new Error(`칸을 찾지 못했다: ${lane}`);
  }

  return found;
};

const createSignal = (
  type: WatchNowSignalType,
  driverNumber: number,
  overrides: Partial<WatchNowSignal> = {},
): WatchNowSignal => ({
  type,
  driverNumber,
  driverCode: `D${driverNumber}`,
  lapNumber: 20,
  detectedAt: new Date(BASE_TIME_MS).toISOString(),
  tireAgeLaps: null,
  gapSeconds: null,
  rivalDriverNumber: null,
  rivalDriverCode: null,
  positionFrom: null,
  positionTo: null,
  predictedLapsToBattle: null,
  ...overrides,
});

describe("추월 예측 신호 변환", () => {
  it("스냅샷 forecasts 를 신호로 옮긴다 — 타입·주체·상대·예측 랩", () => {
    const snapshot = createSnapshot(
      [createDriver(4, 2), createDriver(5, 1)],
      [createForecast(4, 5, 3)],
    );

    const signals = buildOvertakeForecastSignals(snapshot);

    expect(signals).toHaveLength(1);

    const signal = signals[0];

    expect(signal?.type).toBe(WatchNowSignalType.OvertakeForecast);
    // chaser 가 주체다 — 알림을 받는 쪽은 따라잡는 뒷차.
    expect(signal?.driverNumber).toBe(4);
    expect(signal?.driverCode).toBe("D4");
    // target 은 상대역으로 실린다.
    expect(signal?.rivalDriverNumber).toBe(5);
    expect(signal?.rivalDriverCode).toBe("D5");
    expect(signal?.predictedLapsToBattle).toBe(3);
    expect(signal?.detectedAt).toBe(snapshot.generatedAt);
    expect(signal?.lapNumber).toBe(20);
  });

  it("forecasts 가 없으면(undefined) 신호가 없다", () => {
    const snapshot = createSnapshot([createDriver(4, 2), createDriver(5, 1)]);

    expect(buildOvertakeForecastSignals(snapshot)).toHaveLength(0);
  });

  it("forecasts 가 빈 배열이면 신호가 없다", () => {
    const snapshot = createSnapshot([createDriver(4, 2), createDriver(5, 1)], []);

    expect(buildOvertakeForecastSignals(snapshot)).toHaveLength(0);
  });

  it("드라이버 로스터에 없는 chaser 는 건너뛴다", () => {
    const snapshot = createSnapshot(
      [createDriver(5, 1)],
      [createForecast(99, 5, 3)],
    );

    expect(buildOvertakeForecastSignals(snapshot)).toHaveLength(0);
  });
});

describe("추월 예측 칸 배치", () => {
  it("chaser 가 P2 면 선두권 칸이다", () => {
    const feed = new WatchNowFeed();
    const snapshot = createSnapshot(
      [createDriver(4, 2), createDriver(5, 1)],
      [createForecast(4, 5, 3)],
    );

    feed.observe(snapshot);

    const leader = findLane(feed.buildLanes(snapshot).lanes, WatchNowLane.Leader);

    expect(leader.entries.map((entry) => entry.signal.driverNumber)).toEqual([4]);
  });

  it("chaser 가 P8 이면 필드 칸이다", () => {
    const feed = new WatchNowFeed();
    const snapshot = createSnapshot(
      [createDriver(8, 8), createDriver(7, 7)],
      [createForecast(8, 7, 4)],
    );

    feed.observe(snapshot);

    const lanes = feed.buildLanes(snapshot).lanes;

    expect(
      findLane(lanes, WatchNowLane.Field).entries.map(
        (entry) => entry.signal.driverNumber,
      ),
    ).toEqual([8]);
    expect(findLane(lanes, WatchNowLane.Leader).entries).toHaveLength(0);
  });

  it("chaser 가 즐겨찾기면 내 드라이버 칸으로 간다", () => {
    const feed = new WatchNowFeed();
    const snapshot = createSnapshot(
      [createDriver(8, 8), createDriver(7, 7)],
      [createForecast(8, 7, 4)],
    );

    feed.observe(snapshot);

    const favorite = findLane(
      feed.buildLanes(snapshot, [8]).lanes,
      WatchNowLane.Favorite,
    );

    expect(favorite.entries.map((entry) => entry.signal.driverNumber)).toEqual([8]);
  });

  it("target 이 즐겨찾기여도 내 드라이버 칸으로 간다", () => {
    const feed = new WatchNowFeed();
    const snapshot = createSnapshot(
      [createDriver(8, 8), createDriver(7, 7)],
      [createForecast(8, 7, 4)],
    );

    feed.observe(snapshot);

    // 즐겨찾기는 target(7)뿐인데도 예측 신호가 내 드라이버 칸에 올라야 한다.
    const favorite = findLane(
      feed.buildLanes(snapshot, [7]).lanes,
      WatchNowLane.Favorite,
    );

    expect(favorite.entries.map((entry) => entry.signal.driverNumber)).toEqual([8]);
    expect(favorite.collapsed).toBe(false);
  });

  it("같은 프레임을 다시 관측해도 예측 신호가 두 번 쌓이지 않는다", () => {
    const feed = new WatchNowFeed();
    const snapshot = createSnapshot(
      [createDriver(4, 2), createDriver(5, 1)],
      [createForecast(4, 5, 3)],
    );

    feed.observe(snapshot);
    feed.observe(snapshot);

    const leader = findLane(feed.buildLanes(snapshot).lanes, WatchNowLane.Leader);

    expect(leader.entries).toHaveLength(1);
    expect(feed.buildLanes(snapshot).overflow).toHaveLength(0);
  });

  it("예측이 아닌 신호(언더컷)의 상대역이 즐겨찾기여도 내 드라이버 칸으로 가지 않는다", () => {
    const snapshot = createSnapshot(
      [createDriver(8, 8), createDriver(7, 7)],
    );

    // 언더컷 신호를 직접 생성: 주체 8, 상대역 7
    const undercut = createSignal(WatchNowSignalType.UndercutThreat, 8, {
      rivalDriverNumber: 7,
      rivalDriverCode: "D7",
    });

    const lanes = buildWatchNowLanes({
      signals: [undercut],
      snapshot,
      favoriteDriverNumbers: [7], // 즐겨찾기: 드라이버 7
      config: { ...DEFAULT_WATCH_NOW_LANE_CONFIG, maxEntriesPerLane: 10 },
    });

    // 즐겨찾기는 드라이버 7뿐인데, 언더컷 신호는 예측(OvertakeForecast)이 아니므로
    // 상대역 즐겨찾기 판정이 적용되지 않는다. 따라서 내 드라이버 칸은 비어있어야 한다.
    // (isFavorite는 예측 신호로만 상대역을 체크한다)
    const favorite = findLane(lanes.lanes, WatchNowLane.Favorite);

    expect(favorite.entries).toHaveLength(0);
    // 신호 자체는 필드나 선두권 칸에 올라가야 한다 (구조 칸에만 배치)
    expect(
      lanes.lanes
        .filter(
          (group) =>
            group.lane === WatchNowLane.Field || group.lane === WatchNowLane.Leader,
        )
        .some((group) => group.entries.some((e) => e.signal.driverNumber === 8)),
    ).toBe(true);
  });
});
