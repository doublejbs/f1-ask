import { describe, expect, it } from "vitest";
import { LiveDriverState } from "../src/LiveDriverState";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { SessionStatus } from "../src/SessionStatus";
import { TireCompound } from "../src/TireCompound";
import { WatchNowFeed } from "../src/watchnow/WatchNowFeed";
import { WatchNowLane } from "../src/watchnow/WatchNowLane";
import { WatchNowLaneGroup } from "../src/watchnow/WatchNowLaneBuilder";
import { WATCH_NOW_CANDIDATE_WINDOW_MS } from "../src/watchnow/WatchNowLaneConfig";
import { WatchNowSignalType } from "../src/watchnow/WatchNowSignalType";

// 이 파일은 **클라이언트가 실제로 밟는 경로**를 고정한다. React 훅은 vitest 수집 범위
// (`packages/**/test`) 밖이므로, 훅이 하던 상태 관리를 도메인으로 올린 뒤 여기서 검증한다.
//
// 특히 훅에서 틀리기 쉬운 두 가지를 고정한다.
//   1. 같은 스냅샷을 두 번 관측해도 중복 발화하지 않는다(리렌더 · StrictMode 이중 호출).
//   2. 인스턴스를 유지하면 프레임 간 상태가 누적된다(리렌더마다 새로 만들면 감지 자체가
//      동작하지 않는다).

const BASE_TIME_MS = Date.parse("2026-07-19T13:00:00.000Z");

type DriverOverrides = Partial<LiveDriverState>;

const createDriver = (
  driverNumber: number,
  position: number,
  overrides: DriverOverrides = {},
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
  tireAgeLaps: 5,
  pitStopCount: 0,
  inPit: false,
  retired: false,
  recentLapTimesSeconds: [],
  ...overrides,
});

type SnapshotOverrides = {
  version?: number;
  offsetMs?: number;
  sessionId?: string;
  status?: SessionStatus;
};

const createSnapshot = (
  drivers: LiveDriverState[],
  { version = 1, offsetMs = 0, sessionId = "session:a", status = SessionStatus.Green }: SnapshotOverrides = {},
): LiveRaceSnapshot => {
  const iso = new Date(BASE_TIME_MS + offsetMs).toISOString();

  return {
    schemaVersion: 1,
    sessionId,
    sessionKey: 1,
    meetingKey: 1,
    sessionName: "Race",
    sessionType: "Race",
    circuitName: "Spa-Francorchamps",
    countryCode: "BEL",
    status,
    currentLap: 20,
    totalLaps: 44,
    drivers,
    generatedAt: iso,
    sourceUpdatedAt: iso,
    version,
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

// 타이어 임계(기본 20랩)를 넘긴 P5 한 명. A 감지기가 스틴트당 1회 발화한다.
const createAgedTireDriver = (tireAgeLaps: number): LiveDriverState =>
  createDriver(5, 5, { tireAgeLaps });

describe("WatchNowFeed", () => {
  it("같은 프레임을 다시 관측하면 소비하지 않는다", () => {
    const feed = new WatchNowFeed();
    const snapshot = createSnapshot([createAgedTireDriver(25)], { version: 7 });

    expect(feed.observe(snapshot)).toBe(true);
    expect(feed.observe(snapshot)).toBe(false);
    // 객체 identity 가 달라도 version 이 같으면 같은 프레임이다.
    expect(feed.observe(createSnapshot([createAgedTireDriver(25)], { version: 7 }))).toBe(
      false,
    );
  });

  it("중복 관측해도 신호가 두 번 쌓이지 않는다", () => {
    const feed = new WatchNowFeed();
    const snapshot = createSnapshot([createAgedTireDriver(25)], { version: 1 });

    feed.observe(snapshot);
    feed.observe(snapshot);
    feed.observe(snapshot);

    const lanes = feed.buildLanes(snapshot);
    const field = findLane(lanes.lanes, WatchNowLane.Field);

    expect(field.entries).toHaveLength(1);
    expect(field.entries[0]?.signal.type).toBe(WatchNowSignalType.TireAge);
    // 밀려난 중복도 없어야 한다 — 후보 접기가 아니라 애초에 발화가 한 번이어야 한다.
    expect(lanes.overflow).toHaveLength(0);
  });

  it("인스턴스를 유지하면 프레임 간 상태가 누적된다 — 스틴트당 1회 제한이 유지된다", () => {
    const feed = new WatchNowFeed();

    feed.observe(createSnapshot([createAgedTireDriver(25)], { version: 1 }));

    const later = createSnapshot([createAgedTireDriver(26)], {
      version: 2,
      offsetMs: 6_000,
    });

    feed.observe(later);

    const field = findLane(feed.buildLanes(later).lanes, WatchNowLane.Field);

    // 두 프레임 모두 임계를 넘었지만 스틴트가 그대로이므로 발화는 한 번이다.
    expect(field.entries).toHaveLength(1);
  });

  it("리렌더마다 새 인스턴스를 만들면 감지 상태가 사라진다 (안티패턴 고정)", () => {
    const first = createSnapshot([createAgedTireDriver(25)], { version: 1 });
    const second = createSnapshot([createAgedTireDriver(26)], {
      version: 2,
      offsetMs: 6_000,
    });

    new WatchNowFeed().observe(first);

    const freshFeed = new WatchNowFeed();

    freshFeed.observe(second);

    const field = findLane(freshFeed.buildLanes(second).lanes, WatchNowLane.Field);

    // 새 인스턴스는 직전 스틴트 발화를 모르므로 같은 상황을 다시 발화한다.
    // 훅이 인스턴스를 ref 로 붙들어야 하는 이유가 이것이다.
    expect(field.entries).toHaveLength(1);
    expect(field.entries[0]?.signal.type).toBe(WatchNowSignalType.TireAge);
  });

  it("후보 창을 벗어난 신호는 화면에서 사라진다", () => {
    const feed = new WatchNowFeed();

    feed.observe(createSnapshot([createAgedTireDriver(25)], { version: 1 }));

    const muchLater = createSnapshot([createAgedTireDriver(26)], {
      version: 2,
      offsetMs: WATCH_NOW_CANDIDATE_WINDOW_MS + 1_000,
    });

    feed.observe(muchLater);

    const lanes = feed.buildLanes(muchLater);

    expect(findLane(lanes.lanes, WatchNowLane.Field).entries).toHaveLength(0);
    expect(findLane(lanes.lanes, WatchNowLane.Leader).entries).toHaveLength(0);
    expect(lanes.overflow).toHaveLength(0);
  });

  it("즐겨찾기가 없으면 내 드라이버 칸이 접히고, 있으면 접히지 않는다", () => {
    const feed = new WatchNowFeed();
    const snapshot = createSnapshot([createAgedTireDriver(25)], { version: 1 });

    feed.observe(snapshot);

    expect(findLane(feed.buildLanes(snapshot).lanes, WatchNowLane.Favorite).collapsed).toBe(
      true,
    );
    expect(
      findLane(feed.buildLanes(snapshot, [5]).lanes, WatchNowLane.Favorite).collapsed,
    ).toBe(false);
    // 즐겨찾기 인자만 바뀌어도 감지 상태는 건드리지 않는다(부수효과 없음).
    expect(findLane(feed.buildLanes(snapshot).lanes, WatchNowLane.Field).entries).toHaveLength(
      1,
    );
  });

  it("세션이 바뀌면 이전 세션의 감지 상태를 버린다", () => {
    const feed = new WatchNowFeed();

    feed.observe(createSnapshot([createAgedTireDriver(25)], { version: 1 }));

    const nextSession = createSnapshot([createAgedTireDriver(26)], {
      version: 1,
      offsetMs: 6_000,
      sessionId: "session:b",
    });

    // version 이 같아도 세션이 다르면 같은 프레임이 아니다.
    expect(feed.observe(nextSession)).toBe(true);

    const field = findLane(feed.buildLanes(nextSession).lanes, WatchNowLane.Field);

    // 상태가 초기화됐으므로 새 세션에서 다시 발화한다.
    expect(field.entries).toHaveLength(1);
  });

  it("레이스 중이 아닌 상태에서는 아무 신호도 쌓이지 않는다", () => {
    const feed = new WatchNowFeed();
    const finished = createSnapshot([createAgedTireDriver(25)], {
      version: 1,
      status: SessionStatus.Finished,
    });

    expect(feed.observe(finished)).toBe(true);

    const lanes = feed.buildLanes(finished);

    expect(findLane(lanes.lanes, WatchNowLane.Field).entries).toHaveLength(0);
  });

  it("reset 후에는 같은 프레임을 다시 관측할 수 있다", () => {
    const feed = new WatchNowFeed();
    const snapshot = createSnapshot([createAgedTireDriver(25)], { version: 1 });

    feed.observe(snapshot);
    feed.reset();

    expect(feed.observe(snapshot)).toBe(true);
    expect(
      findLane(feed.buildLanes(snapshot).lanes, WatchNowLane.Field).entries,
    ).toHaveLength(1);
  });

  // reset() 은 감지기를 새로 만들므로 콜드 스타트 보장이 여기서도 그대로 성립해야 한다.
  // 세션 전환에서 자동으로 불리는 경로라, 여기가 깨지면 세션이 바뀔 때마다 가짜 언더컷이
  // 화면을 채운다.
  it("reset 후 첫 프레임에서도 이미 피트한 드라이버가 언더컷으로 잡히지 않는다", () => {
    const feed = new WatchNowFeed();
    const midRaceField = [
      createDriver(1, 1, { pitStopCount: 1 }),
      createDriver(2, 2, { pitStopCount: 2 }),
      createDriver(3, 3, { pitStopCount: 1 }),
      createDriver(4, 4, { pitStopCount: 2 }),
    ];

    feed.observe(createSnapshot(midRaceField, { version: 1 }));
    feed.reset();
    feed.observe(createSnapshot(midRaceField, { version: 1 }));

    const lanes = feed.buildLanes(createSnapshot(midRaceField, { version: 1 }));
    const undercuts = lanes.lanes
      .flatMap((group) => group.entries)
      .concat(lanes.overflow)
      .filter(
        (entry) => entry.signal.type === WatchNowSignalType.UndercutThreat,
      );

    expect(undercuts).toHaveLength(0);
  });

  // 세션 전환은 reset() 을 자동으로 부른다. 새 세션의 첫 프레임은 기준선만 잡아야 한다.
  it("세션이 바뀐 뒤 첫 프레임도 기준선만 잡는다", () => {
    const feed = new WatchNowFeed();
    const previousField = [
      createDriver(1, 1, { pitStopCount: 0 }),
      createDriver(2, 2, { pitStopCount: 0 }),
    ];
    const nextField = [
      createDriver(1, 1, { pitStopCount: 1 }),
      createDriver(2, 2, { pitStopCount: 2 }),
    ];

    feed.observe(createSnapshot(previousField, { version: 1 }));

    const nextSnapshot = createSnapshot(nextField, {
      version: 1,
      sessionId: "session:b",
    });

    feed.observe(nextSnapshot);

    const lanes = feed.buildLanes(nextSnapshot);
    const undercuts = lanes.lanes
      .flatMap((group) => group.entries)
      .concat(lanes.overflow)
      .filter(
        (entry) => entry.signal.type === WatchNowSignalType.UndercutThreat,
      );

    expect(undercuts).toHaveLength(0);
  });
});
