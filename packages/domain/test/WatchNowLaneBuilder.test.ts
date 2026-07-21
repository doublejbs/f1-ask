import { describe, expect, it } from "vitest";
import { LiveDriverState } from "../src/LiveDriverState";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { SessionStatus } from "../src/SessionStatus";
import { TireCompound } from "../src/TireCompound";
import {
  F1_RACE_POINTS_BY_POSITION,
  resolveChampionshipPoints,
  resolvePointsBetweenPositions,
} from "../src/watchnow/WatchNowChampionshipPoints";
import { WatchNowLane } from "../src/watchnow/WatchNowLane";
import {
  buildWatchNowLanes,
  WatchNowLaneGroup,
  WatchNowLanes,
} from "../src/watchnow/WatchNowLaneBuilder";
import { selectWatchNowCandidates } from "../src/watchnow/WatchNowLaneBuilder";
import { DEFAULT_WATCH_NOW_LANE_CONFIG } from "../src/watchnow/WatchNowLaneConfig";
import { WatchNowSignal } from "../src/watchnow/WatchNowSignal";
import { WatchNowSignalType } from "../src/watchnow/WatchNowSignalType";

const BASE_TIME_MS = Date.parse("2026-07-19T13:00:00.000Z");

const createDriver = (
  driverNumber: number,
  position: number | null,
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

// 순위는 배열 인덱스가 아니라 명시적으로 준다 — 칸 경계 테스트가 순서에 흔들리면 안 된다.
const createSnapshot = (positions: Map<number, number | null>): LiveRaceSnapshot => ({
  schemaVersion: 1,
  sessionId: "session:test",
  sessionKey: 1,
  meetingKey: 1,
  sessionName: "Race",
  sessionType: "Race",
  circuitName: "Spa-Francorchamps",
  countryCode: "BEL",
  status: SessionStatus.Green,
  currentLap: 20,
  totalLaps: 44,
  drivers: [...positions].map(([driverNumber, position]) =>
    createDriver(driverNumber, position),
  ),
  generatedAt: new Date(BASE_TIME_MS).toISOString(),
  sourceUpdatedAt: new Date(BASE_TIME_MS).toISOString(),
  version: 1,
});

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
  ...overrides,
});

const findLane = (lanes: WatchNowLanes, lane: WatchNowLane): WatchNowLaneGroup => {
  const group = lanes.lanes.find((candidate) => candidate.lane === lane);

  if (group === undefined) {
    throw new Error(`칸이 없다: ${lane}`);
  }

  return group;
};

const driversIn = (lanes: WatchNowLanes, lane: WatchNowLane): number[] =>
  findLane(lanes, lane).entries.map((entry) => entry.signal.driverNumber);

// 칸 안 순서가 아니라 "누가 그 칸에 있는가"만 볼 때 쓴다. 기본 sort 는 사전순이라
// [4, 5, 20] 이 [20, 4, 5] 가 되므로 숫자 비교를 명시한다.
const sortedDriversIn = (lanes: WatchNowLanes, lane: WatchNowLane): number[] =>
  [...driversIn(lanes, lane)].sort((a, b) => a - b);

describe("WatchNow 칸 구성", () => {
  describe("걸린 챔피언십 포인트", () => {
    // docs/19 §칸 안에서 무엇을 고를 것인가 — 유일한 정량 기준이고 F1 규정에서 온다.
    it("포인트 표가 F1 규정 그대로다", () => {
      expect(F1_RACE_POINTS_BY_POSITION).toEqual([25, 18, 15, 12, 10, 8, 6, 4, 2, 1]);
      expect(resolveChampionshipPoints(1)).toBe(25);
      expect(resolveChampionshipPoints(10)).toBe(1);
      expect(resolveChampionshipPoints(11)).toBe(0);
      expect(resolveChampionshipPoints(null)).toBe(0);
    });

    it("자리 교환에 걸린 포인트가 규정 차이와 같다", () => {
      expect(resolvePointsBetweenPositions(1, 2)).toBe(7);
      expect(resolvePointsBetweenPositions(10, 11)).toBe(1);
      expect(resolvePointsBetweenPositions(16, 17)).toBe(0);
      // 방향은 보지 않는다 — 뺏는 쪽과 뺏기는 쪽은 같은 배틀이다.
      expect(resolvePointsBetweenPositions(2, 1)).toBe(7);
    });

    it("간격 수렴은 앞자리와의 차이로 잰다", () => {
      const lanes = buildWatchNowLanes({
        signals: [createSignal(WatchNowSignalType.GapConvergence, 1)],
        snapshot: createSnapshot(
          new Map([
            [9, 1],
            [1, 2],
          ]),
        ),
      });

      // P2 가 P1 을 따라붙는다 → 25 − 18 = 7.
      expect(findLane(lanes, WatchNowLane.Leader).entries[0]?.pointsAtStake).toBe(7);
    });

    it("언더컷은 주체와 피트인한 뒤차의 실제 순위 차이로 잰다", () => {
      const lanes = buildWatchNowLanes({
        signals: [
          createSignal(WatchNowSignalType.UndercutThreat, 1, {
            rivalDriverNumber: 2,
            rivalDriverCode: "D2",
          }),
        ],
        snapshot: createSnapshot(
          new Map([
            [1, 9],
            [2, 11],
          ]),
        ),
      });

      // P9(2점) ↔ P11(0점) → 2점.
      expect(findLane(lanes, WatchNowLane.Field).entries[0]?.pointsAtStake).toBe(2);
    });

    it("순위 급변은 실제로 오간 포인트로 잰다", () => {
      const lanes = buildWatchNowLanes({
        signals: [
          createSignal(WatchNowSignalType.PositionSwing, 1, {
            positionFrom: 4,
            positionTo: 1,
          }),
        ],
        snapshot: createSnapshot(new Map([[1, 1]])),
      });

      // P4(12점) → P1(25점) → 13점.
      expect(findLane(lanes, WatchNowLane.Leader).entries[0]?.pointsAtStake).toBe(13);
    });

    it("타이어 노후는 상대가 없으므로 바로 아래 자리 하나로 잰다", () => {
      const lanes = buildWatchNowLanes({
        signals: [createSignal(WatchNowSignalType.TireAge, 1)],
        snapshot: createSnapshot(new Map([[1, 10]])),
      });

      // P10(1점) ↔ P11(0점) → 1점. 몇 자리를 잃을지는 데이터에 없으므로 지어내지 않는다.
      expect(findLane(lanes, WatchNowLane.Field).entries[0]?.pointsAtStake).toBe(1);
    });

    it("포인트권 밖 배틀은 0점이지만 칸에서 배제되지는 않는다", () => {
      const lanes = buildWatchNowLanes({
        signals: [createSignal(WatchNowSignalType.TireAge, 1)],
        snapshot: createSnapshot(new Map([[1, 18]])),
      });

      expect(findLane(lanes, WatchNowLane.Field).entries[0]?.pointsAtStake).toBe(0);
      expect(driversIn(lanes, WatchNowLane.Field)).toEqual([1]);
    });
  });

  describe("칸 배정", () => {
    // docs/19 §화면 — 주체 드라이버의 현재 순위 하나로 정한다.
    it("P1~P3 은 선두권 칸, P4 이하는 필드 칸이다", () => {
      const lanes = buildWatchNowLanes({
        signals: [1, 2, 3, 4, 5, 20].map((driverNumber) =>
          createSignal(WatchNowSignalType.TireAge, driverNumber),
        ),
        snapshot: createSnapshot(
          new Map([
            [1, 1],
            [2, 2],
            [3, 3],
            [4, 4],
            [5, 12],
            [20, 20],
          ]),
        ),
        config: { ...DEFAULT_WATCH_NOW_LANE_CONFIG, maxEntriesPerLane: 10 },
      });

      expect(sortedDriversIn(lanes, WatchNowLane.Leader)).toEqual([1, 2, 3]);
      expect(sortedDriversIn(lanes, WatchNowLane.Field)).toEqual([4, 5, 20]);
    });

    it("필드 칸은 중위권으로 좁혀지지 않는다 — P15~P20 이 남는다", () => {
      const lanes = buildWatchNowLanes({
        signals: [15, 18, 20].map((driverNumber) =>
          createSignal(WatchNowSignalType.TireAge, driverNumber),
        ),
        snapshot: createSnapshot(
          new Map([
            [15, 15],
            [18, 18],
            [20, 20],
          ]),
        ),
        // 이 테스트가 보는 것은 **범위**(P15~P20 이 필드 칸에 속하는가)이지 화면 예산이
        // 아니다. 기본 줄 수(2)로 두면 셋 중 하나가 상한에 걸려 잘려 나가고, 그러면
        // "범위 밖이라 빠진 것"과 "자리가 없어 밀린 것"을 구분할 수 없다. 상한을 넉넉히
        // 열어 범위만 검증한다.
        config: { ...DEFAULT_WATCH_NOW_LANE_CONFIG, maxEntriesPerLane: 10 },
      });

      expect(sortedDriversIn(lanes, WatchNowLane.Field)).toEqual([15, 18, 20]);
    });

    it("상대역이 다른 칸이어도 주체 순위로만 배정한다", () => {
      const lanes = buildWatchNowLanes({
        signals: [createSignal(WatchNowSignalType.GapConvergence, 4)],
        snapshot: createSnapshot(
          new Map([
            [3, 3],
            [4, 4],
          ]),
        ),
      });

      // P4 가 P3 를 따라붙는 포디움 배틀이지만 주체가 P4 이므로 필드 칸이다.
      expect(driversIn(lanes, WatchNowLane.Leader)).toEqual([]);
      expect(driversIn(lanes, WatchNowLane.Field)).toEqual([4]);
      // 정보가 사라지지는 않는다 — 걸린 포인트(15 − 12 = 3)로 칸 안에서 위로 올라온다.
      expect(findLane(lanes, WatchNowLane.Field).entries[0]?.pointsAtStake).toBe(3);
    });

    it("순위를 모르는 드라이버는 필드 칸이다", () => {
      const lanes = buildWatchNowLanes({
        signals: [createSignal(WatchNowSignalType.TireAge, 99)],
        snapshot: createSnapshot(new Map([[1, 1]])),
      });

      expect(driversIn(lanes, WatchNowLane.Field)).toEqual([99]);
      expect(findLane(lanes, WatchNowLane.Field).entries[0]?.position).toBeNull();
    });
  });

  describe("내 드라이버 칸", () => {
    // docs/19 수용 기준 1 · 2.
    it("즐겨찾기가 없으면 접힌다", () => {
      const lanes = buildWatchNowLanes({
        signals: [
          createSignal(WatchNowSignalType.TireAge, 1),
          createSignal(WatchNowSignalType.TireAge, 5),
        ],
        snapshot: createSnapshot(
          new Map([
            [1, 1],
            [5, 12],
          ]),
        ),
      });
      const favorite = findLane(lanes, WatchNowLane.Favorite);

      expect(favorite.collapsed).toBe(true);
      expect(favorite.entries).toEqual([]);
      // 접히더라도 나머지 두 칸은 그대로 채워진다.
      expect(driversIn(lanes, WatchNowLane.Leader)).toEqual([1]);
      expect(driversIn(lanes, WatchNowLane.Field)).toEqual([5]);
    });

    it("즐겨찾기를 아예 넘기지 않아도 동작한다", () => {
      const lanes = buildWatchNowLanes({
        signals: [createSignal(WatchNowSignalType.TireAge, 5)],
        snapshot: createSnapshot(new Map([[5, 12]])),
      });

      expect(findLane(lanes, WatchNowLane.Favorite).collapsed).toBe(true);
      expect(driversIn(lanes, WatchNowLane.Field)).toEqual([5]);
    });

    it("즐겨찾기가 있는데 조용하면 비었을 뿐 접히지 않는다", () => {
      const lanes = buildWatchNowLanes({
        signals: [createSignal(WatchNowSignalType.TireAge, 5)],
        snapshot: createSnapshot(
          new Map([
            [5, 12],
            [7, 8],
          ]),
        ),
        favoriteDriverNumbers: [7],
      });
      const favorite = findLane(lanes, WatchNowLane.Favorite);

      // "내 드라이버가 없다" 와 "내 드라이버가 지금 조용하다" 는 화면에서 달라야 한다.
      expect(favorite.collapsed).toBe(false);
      expect(favorite.entries).toEqual([]);
    });

    it("즐겨찾기 신호는 내 드라이버 칸으로 간다", () => {
      const lanes = buildWatchNowLanes({
        signals: [
          createSignal(WatchNowSignalType.TireAge, 5),
          createSignal(WatchNowSignalType.TireAge, 7),
        ],
        snapshot: createSnapshot(
          new Map([
            [5, 12],
            [7, 8],
          ]),
        ),
        favoriteDriverNumbers: [7],
      });

      expect(driversIn(lanes, WatchNowLane.Favorite)).toEqual([7]);
      expect(driversIn(lanes, WatchNowLane.Field)).toEqual([5]);
    });
  });

  describe("칸 안 정렬", () => {
    // docs/19 §칸 안에서 무엇을 고를 것인가 — 규칙은 포인트 → 최신, 둘뿐이다.
    it("걸린 포인트가 큰 것이 먼저다", () => {
      const lanes = buildWatchNowLanes({
        signals: [
          // P16 (0점) 언더컷 — 예전 점수 랭킹에서는 이것이 1위였다.
          createSignal(WatchNowSignalType.UndercutThreat, 16, {
            rivalDriverNumber: 18,
            rivalDriverCode: "D18",
          }),
          // P5 (2점) 타이어.
          createSignal(WatchNowSignalType.TireAge, 5),
        ],
        snapshot: createSnapshot(
          new Map([
            [5, 5],
            [16, 16],
            [18, 18],
          ]),
        ),
      });

      expect(driversIn(lanes, WatchNowLane.Field)).toEqual([5, 16]);
    });

    it("포인트가 같으면 방금 일어난 것이 먼저다", () => {
      const lanes = buildWatchNowLanes({
        signals: [
          createSignal(WatchNowSignalType.TireAge, 15, {
            detectedAt: new Date(BASE_TIME_MS - 60_000).toISOString(),
          }),
          createSignal(WatchNowSignalType.TireAge, 16, {
            detectedAt: new Date(BASE_TIME_MS - 5_000).toISOString(),
          }),
        ],
        snapshot: createSnapshot(
          new Map([
            [15, 15],
            [16, 16],
          ]),
        ),
      });

      // 둘 다 포인트권 밖이라 0점 동점 — 최신이 위다.
      expect(driversIn(lanes, WatchNowLane.Field)).toEqual([16, 15]);
    });

    it("감지기 종류는 순서에 영향을 주지 않는다", () => {
      // 폐기한 기본 점수(타이어 50 vs 순위 급변 30)가 살아 있다면 이 테스트가 깨진다.
      const lanes = buildWatchNowLanes({
        signals: [
          // P8 타이어 — 4 − 2 = 2점.
          createSignal(WatchNowSignalType.TireAge, 8),
          // P9 순위 급변 P12 → P9 — 12위(0점) ↔ 9위(2점) = 2점. 같은 포인트지만 더 최신.
          createSignal(WatchNowSignalType.PositionSwing, 9, {
            positionFrom: 12,
            positionTo: 9,
            detectedAt: new Date(BASE_TIME_MS + 1_000).toISOString(),
          }),
        ],
        snapshot: createSnapshot(
          new Map([
            [8, 8],
            [9, 9],
          ]),
        ),
      });

      expect(driversIn(lanes, WatchNowLane.Field)).toEqual([9, 8]);
    });

    it("입력 순서가 달라도 결과가 같다", () => {
      const snapshot = createSnapshot(
        new Map([
          [1, 5],
          [2, 6],
          [3, 7],
        ]),
      );
      const signals = [1, 2, 3].map((driverNumber) =>
        createSignal(WatchNowSignalType.TireAge, driverNumber),
      );
      const forward = buildWatchNowLanes({ signals, snapshot });
      const reversed = buildWatchNowLanes({
        signals: [...signals].reverse(),
        snapshot,
      });

      expect(driversIn(reversed, WatchNowLane.Field)).toEqual(
        driversIn(forward, WatchNowLane.Field),
      );
    });
  });

  describe("다양성 캡", () => {
    // docs/19 수용 기준 9 — 상대역으로 등장하는 경우도 포함한다.
    it("같은 드라이버가 두 칸에 뜨지 않는다 (상대역 포함)", () => {
      const lanes = buildWatchNowLanes({
        signals: [
          // 선두권 칸: P2 가 P17 의 피트인에 언더컷 위협을 받는다(상대역 = 17번).
          createSignal(WatchNowSignalType.UndercutThreat, 2, {
            rivalDriverNumber: 17,
            rivalDriverCode: "D17",
          }),
          // 필드 칸: 그 17번이 이번엔 주체로 순위 급변을 낸다.
          createSignal(WatchNowSignalType.PositionSwing, 17, {
            positionFrom: 15,
            positionTo: 18,
          }),
        ],
        snapshot: createSnapshot(
          new Map([
            [2, 2],
            [17, 17],
          ]),
        ),
      });
      const shown = [
        ...driversIn(lanes, WatchNowLane.Leader),
        ...driversIn(lanes, WatchNowLane.Field),
      ];

      expect(driversIn(lanes, WatchNowLane.Leader)).toEqual([2]);
      // 17번은 이미 선두권 칸에서 상대역으로 화면을 차지했다.
      expect(driversIn(lanes, WatchNowLane.Field)).toEqual([]);
      expect(new Set(shown).size).toBe(shown.length);
      // 밀려난 신호는 버려지지 않는다.
      expect(lanes.overflow.map((entry) => entry.signal.driverNumber)).toEqual([17]);
    });

    it("한 번의 피트인이 여러 줄을 차지하지 않는다", () => {
      const undercut = (driverNumber: number): WatchNowSignal =>
        createSignal(WatchNowSignalType.UndercutThreat, driverNumber, {
          rivalDriverNumber: 9,
          rivalDriverCode: "D9",
        });
      const lanes = buildWatchNowLanes({
        signals: [undercut(5), undercut(6)],
        snapshot: createSnapshot(
          new Map([
            [5, 5],
            [6, 6],
            [9, 7],
          ]),
        ),
      });

      // 사건은 하나(9번 피트인)이므로 줄도 하나다.
      expect(findLane(lanes, WatchNowLane.Field).entries).toHaveLength(1);
      expect(lanes.overflow).toHaveLength(1);
    });

    it("같은 간격 배틀이 두 줄로 올라가지 않는다", () => {
      const lanes = buildWatchNowLanes({
        signals: [
          // P11 이 P10 을 따라붙는다.
          createSignal(WatchNowSignalType.GapConvergence, 11),
          // P10 이 마침 타이어도 낡았다 — 같은 두 드라이버가 다시 등장한다.
          createSignal(WatchNowSignalType.TireAge, 10),
        ],
        snapshot: createSnapshot(
          new Map([
            [10, 10],
            [11, 11],
          ]),
        ),
      });

      expect(findLane(lanes, WatchNowLane.Field).entries).toHaveLength(1);
    });

    it("내 드라이버 칸이 우선권을 갖는다", () => {
      const lanes = buildWatchNowLanes({
        signals: [
          createSignal(WatchNowSignalType.UndercutThreat, 1, {
            rivalDriverNumber: 7,
            rivalDriverCode: "D7",
          }),
          createSignal(WatchNowSignalType.TireAge, 7),
        ],
        snapshot: createSnapshot(
          new Map([
            [1, 1],
            [7, 4],
          ]),
        ),
        favoriteDriverNumbers: [7],
      });

      // 후보 풀이 가장 좁은 칸이 먼저 채워진다 — 뺏기면 통째로 비기 때문이다.
      expect(driversIn(lanes, WatchNowLane.Favorite)).toEqual([7]);
      expect(driversIn(lanes, WatchNowLane.Leader)).toEqual([]);
    });

    it("칸 줄 수 상한을 넘으면 나머지는 overflow 로 간다", () => {
      // 상한(현재 2)을 넘기려면 후보가 그보다 많아야 한다. 기대값을 숫자로 박으면
      // 화면 예산을 조절할 때마다 이 테스트가 무관하게 깨지므로 설정에서 유도한다.
      const fieldDriverNumbers = [11, 12, 13, 14];
      const expectedOverflowCount =
        fieldDriverNumbers.length - DEFAULT_WATCH_NOW_LANE_CONFIG.maxEntriesPerLane;
      const lanes = buildWatchNowLanes({
        signals: fieldDriverNumbers.map((driverNumber) =>
          createSignal(WatchNowSignalType.TireAge, driverNumber, {
            detectedAt: new Date(BASE_TIME_MS - driverNumber * 1_000).toISOString(),
          }),
        ),
        snapshot: createSnapshot(
          new Map([
            [11, 11],
            [12, 12],
            [13, 13],
            [14, 14],
          ]),
        ),
      });

      expect(expectedOverflowCount).toBeGreaterThan(0);
      expect(findLane(lanes, WatchNowLane.Field).entries).toHaveLength(
        DEFAULT_WATCH_NOW_LANE_CONFIG.maxEntriesPerLane,
      );
      expect(lanes.overflow).toHaveLength(expectedOverflowCount);
    });
  });

  describe("후보 창", () => {
    it("창 밖의 오래된 신호는 후보에서 빠진다", () => {
      const signals = [
        createSignal(WatchNowSignalType.TireAge, 1, {
          detectedAt: new Date(BASE_TIME_MS - 200_000).toISOString(),
        }),
        createSignal(WatchNowSignalType.TireAge, 2, {
          detectedAt: new Date(BASE_TIME_MS - 30_000).toISOString(),
        }),
      ];

      expect(
        selectWatchNowCandidates(signals, BASE_TIME_MS).map(
          (signal) => signal.driverNumber,
        ),
      ).toEqual([2]);
    });

    it("같은 드라이버 · 같은 종류는 최신 1건으로 접힌다", () => {
      const signals = [
        createSignal(WatchNowSignalType.GapConvergence, 1, {
          detectedAt: new Date(BASE_TIME_MS - 60_000).toISOString(),
          gapSeconds: 0.9,
        }),
        createSignal(WatchNowSignalType.GapConvergence, 1, {
          detectedAt: new Date(BASE_TIME_MS - 10_000).toISOString(),
          gapSeconds: 0.3,
        }),
      ];
      const candidates = selectWatchNowCandidates(signals, BASE_TIME_MS);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.gapSeconds).toBe(0.3);
    });

    it("아직 오지 않은 신호는 후보가 아니다", () => {
      const signals = [
        createSignal(WatchNowSignalType.TireAge, 1, {
          detectedAt: new Date(BASE_TIME_MS + 10_000).toISOString(),
        }),
      ];

      expect(selectWatchNowCandidates(signals, BASE_TIME_MS)).toHaveLength(0);
    });
  });

  // 행 표시(docs/19 수용 기준 7)가 성립하려면 overflow 가 두 가지를 만족해야 한다.
  // **행 표시는 이 두 성질에 전적으로 의존한다** — 칸과 겹치면 같은 신호가 화면에 두 번
  // 나오고, 빠지면 "나머지는 행에서 볼 수 있다"는 약속이 다시 거짓이 된다.
  describe("overflow 와 칸의 관계", () => {
    // 칸 3개 × 2줄 = 최대 6건이므로 넉넉히 넘기려면 후보가 그보다 훨씬 많아야 한다.
    const createCrowdedInput = () => {
      const positions = new Map<number, number | null>();

      for (let driverNumber = 1; driverNumber <= 20; driverNumber += 1) {
        positions.set(driverNumber, driverNumber);
      }

      // 종류를 섞는다 — 상대역이 있는 종류(간격 수렴)가 다양성 캡에 걸려 밀려나는
      // 경로까지 함께 덮는다.
      const signals = [...positions.keys()].map((driverNumber) =>
        createSignal(
          driverNumber % 2 === 0
            ? WatchNowSignalType.GapConvergence
            : WatchNowSignalType.TireAge,
          driverNumber,
        ),
      );

      return { signals, snapshot: createSnapshot(positions) };
    };

    it("칸에 오른 신호는 overflow 에 없다", () => {
      const { signals, snapshot } = createCrowdedInput();
      const lanes = buildWatchNowLanes({
        signals,
        snapshot,
        favoriteDriverNumbers: [7],
      });

      const placed = lanes.lanes.flatMap((group) =>
        group.entries.map((entry) => entry.signal),
      );

      expect(placed.length).toBeGreaterThan(0);
      expect(lanes.overflow.length).toBeGreaterThan(0);

      for (const entry of lanes.overflow) {
        expect(placed).not.toContain(entry.signal);
      }
    });

    it("후보는 칸 아니면 overflow 로 가고, 버려지지 않는다", () => {
      const { signals, snapshot } = createCrowdedInput();
      const lanes = buildWatchNowLanes({
        signals,
        snapshot,
        favoriteDriverNumbers: [7],
      });

      const seen = [
        ...lanes.lanes.flatMap((group) =>
          group.entries.map((entry) => entry.signal),
        ),
        ...lanes.overflow.map((entry) => entry.signal),
      ];

      expect(seen).toHaveLength(signals.length);
      expect(new Set(seen).size).toBe(signals.length);
    });
  });

  describe("빈 입력", () => {
    it("후보가 없어도 칸 구조는 그대로 나온다", () => {
      const lanes = buildWatchNowLanes({
        signals: [],
        snapshot: createSnapshot(new Map([[1, 1]])),
      });

      expect(lanes.lanes.map((group) => group.lane)).toEqual([
        WatchNowLane.Leader,
        WatchNowLane.Field,
        WatchNowLane.Favorite,
      ]);
      expect(lanes.overflow).toEqual([]);
    });
  });
});
