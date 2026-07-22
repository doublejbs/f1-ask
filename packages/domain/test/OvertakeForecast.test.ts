import { describe, expect, it } from "vitest";
import { LiveDriverState } from "../src/LiveDriverState";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { SessionStatus } from "../src/SessionStatus";
import { TireCompound } from "../src/TireCompound";
import { buildOvertakeForecasts } from "../src/openf1/OvertakeForecast";
import { OpenF1Lap, OpenF1Pit, OpenF1SessionData, OpenF1SessionMeta } from "../src/openf1/OpenF1Types";

// 랩 date_start 를 계산하기 위한 기준 시각과 랩당 명목 간격(90초).
const LAP_START_MS = Date.parse("2026-07-19T13:00:00.000Z");
const LAP_INTERVAL_MS = 90_000;

// 모든 랩이 지난 뒤(= 미래 랩이 없는) 넉넉한 nowMs 기본값.
const FAR_FUTURE_MS = LAP_START_MS + 1000 * LAP_INTERVAL_MS;

const lapStartMs = (lapNumber: number): number =>
  LAP_START_MS + lapNumber * LAP_INTERVAL_MS;

const makeLap = (
  driverNumber: number,
  lapNumber: number,
  durationSeconds: number | null,
  startMs: number = lapStartMs(lapNumber),
): OpenF1Lap => ({
  driver_number: driverNumber,
  lap_number: lapNumber,
  date_start: new Date(startMs).toISOString(),
  lap_duration: durationSeconds,
});

// 배틀 판정에 필요한 필드만 지정하고 나머지는 기본값으로 채우는 드라이버 팩토리.
const makeDriver = (
  overrides: Partial<LiveDriverState> & { driverNumber: number; position: number | null },
): LiveDriverState => ({
  code: `D${overrides.driverNumber}`,
  fullName: "Test Driver",
  teamName: "Test Team",
  startingPosition: overrides.position,
  positionChange: 0,
  gapToLeaderSeconds: 0,
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

const META: OpenF1SessionMeta = {
  sessionId: "test",
  sessionKey: 1,
  meetingKey: 1,
  sessionName: "Race",
  sessionType: "Race",
  circuitName: "Test Circuit",
  countryCode: "TST",
};

const makeSnapshot = (
  drivers: LiveDriverState[],
  overrides: Partial<LiveRaceSnapshot> = {},
): LiveRaceSnapshot => ({
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
  generatedAt: "2026-07-19T13:15:00.000Z",
  sourceUpdatedAt: "2026-07-19T13:15:00.000Z",
  version: 1,
  ...overrides,
});

const makeData = (laps: OpenF1Lap[], pits: OpenF1Pit[] = []): OpenF1SessionData => ({
  meta: META,
  drivers: [],
  positions: [],
  intervals: [],
  stints: [],
  laps,
  pits,
  raceControl: [],
});

// 여러 랩을 [랩번호, 랩타임] 쌍으로 한 번에 만든다.
const lapsFor = (
  driverNumber: number,
  entries: [number, number | null][],
): OpenF1Lap[] =>
  entries.map(([lapNumber, duration]) => makeLap(driverNumber, lapNumber, duration));

// P1=target(#1), P2=chaser(#2) 인접 페어. chaser 의 interval 만 바꿔가며 쓴다.
const makePair = (chaserInterval: number): LiveDriverState[] => [
  makeDriver({ driverNumber: 1, position: 1 }),
  makeDriver({ driverNumber: 2, position: 2, intervalToAheadSeconds: chaserInterval }),
];

describe("buildOvertakeForecasts — 잡는 속도 계산", () => {
  it("정상 페어: 앞차가 랩당 0.5초 느림·interval 3.0 → 4랩 예측", () => {
    const drivers = makePair(3.0);
    const data = makeData([
      ...lapsFor(1, [
        [6, 90.5],
        [7, 90.5],
        [8, 90.5],
        [9, 90.5],
        [10, 90.5],
      ]),
      ...lapsFor(2, [
        [6, 90.0],
        [7, 90.0],
        [8, 90.0],
        [9, 90.0],
        [10, 90.0],
      ]),
    ]);

    const forecasts = buildOvertakeForecasts(makeSnapshot(drivers), data, FAR_FUTURE_MS);

    expect(forecasts.length).toBe(1);

    const forecast = forecasts[0];

    expect(forecast?.chaserNumber).toBe(2);
    expect(forecast?.targetNumber).toBe(1);
    expect(forecast?.intervalSeconds).toBe(3.0);
    expect(forecast?.closingRateSecondsPerLap).toBe(0.5);
    // ceil((3.0 - 1.0) / 0.5) = 4
    expect(forecast?.predictedLapsToBattle).toBe(4);
    expect(forecast?.predictedLap).toBe(14);
  });

  it("피트 오염: target 인랩·아웃랩은 제외되고 클린 랩으로 계산한다", () => {
    const drivers = makePair(3.0);
    // target 이 9랩에 피트: 9(인랩) 94.0, 10(아웃랩) 93.0 은 이상치 임계 안이라 오직
    // 피트 제외로만 걸러진다. 제외 안 하면 최근 3랩(8·9·10) 평균이 왜곡돼 예측이 1랩이 된다.
    const data = makeData(
      [
        ...lapsFor(1, [
          [6, 90.5],
          [7, 90.5],
          [8, 90.5],
          [9, 94.0],
          [10, 93.0],
        ]),
        ...lapsFor(2, [
          [6, 90.0],
          [7, 90.0],
          [8, 90.0],
          [9, 90.0],
          [10, 90.0],
        ]),
      ],
      [{ date: new Date(lapStartMs(9)).toISOString(), driver_number: 1, lap_number: 9, pit_duration: 22 }],
    );

    const forecasts = buildOvertakeForecasts(makeSnapshot(drivers), data, FAR_FUTURE_MS);

    expect(forecasts.length).toBe(1);
    // 클린 랩(6·7·8)만 남아 delta 0.5 → 4랩. 제외가 없었다면 1랩이 나왔을 픽스처다.
    expect(forecasts[0]?.closingRateSecondsPerLap).toBe(0.5);
    expect(forecasts[0]?.predictedLapsToBattle).toBe(4);
  });

  it("이상치: 중앙값 +5% 초과 랩(SC 급 느린 랩)은 제외한다", () => {
    const drivers = makePair(3.0);
    // target 10랩이 120초(SC 급). 중앙값 90.5 × 1.05 = 95.025 초과라 제외된다.
    const data = makeData([
      ...lapsFor(1, [
        [6, 90.5],
        [7, 90.5],
        [8, 90.5],
        [9, 90.5],
        [10, 120.0],
      ]),
      ...lapsFor(2, [
        [6, 90.0],
        [7, 90.0],
        [8, 90.0],
        [9, 90.0],
        [10, 90.0],
      ]),
    ]);

    const forecasts = buildOvertakeForecasts(makeSnapshot(drivers), data, FAR_FUTURE_MS);

    expect(forecasts.length).toBe(1);
    // 이상치 제외 후 클린 랩(6·7·8·9) 중 최근 3랩 delta 0.5 → 4랩.
    expect(forecasts[0]?.closingRateSecondsPerLap).toBe(0.5);
    expect(forecasts[0]?.predictedLapsToBattle).toBe(4);
  });

  it("공통 유효 랩이 recentLapCount 미만이면 예측하지 않는다", () => {
    const drivers = makePair(3.0);
    // 공통으로 양쪽 lap_duration 이 있는 랩이 2개뿐(9·10). recentLapCount(3) 미만.
    const data = makeData([
      ...lapsFor(1, [
        [8, null],
        [9, 90.5],
        [10, 90.5],
      ]),
      ...lapsFor(2, [
        [8, 90.0],
        [9, 90.0],
        [10, 90.0],
      ]),
    ]);

    const forecasts = buildOvertakeForecasts(makeSnapshot(drivers), data, FAR_FUTURE_MS);

    expect(forecasts).toEqual([]);
  });

  it("nowMs 이후의 미래 랩은 계산에 들어가지 않는다", () => {
    const drivers = makePair(3.0);
    // 8·9·10 은 nowMs 이전(클린), 11·12 는 미래이며 200초로 왜곡을 준다.
    const data = makeData([
      ...lapsFor(1, [
        [8, 90.5],
        [9, 90.5],
        [10, 90.5],
        [11, 200.0],
        [12, 200.0],
      ]),
      ...lapsFor(2, [
        [8, 90.0],
        [9, 90.0],
        [10, 90.0],
        [11, 90.0],
        [12, 90.0],
      ]),
    ]);

    // 10랩은 시작했고 11랩은 아직 시작 전인 시점.
    const nowMs = lapStartMs(10) + 45_000;
    const forecasts = buildOvertakeForecasts(makeSnapshot(drivers), data, nowMs);

    expect(forecasts.length).toBe(1);
    // 미래 랩이 섞였다면 예측이 1랩으로 왜곡됐을 것이다.
    expect(forecasts[0]?.closingRateSecondsPerLap).toBe(0.5);
    expect(forecasts[0]?.predictedLapsToBattle).toBe(4);
  });

  it("반올림: interval 1자리·rate 2자리, 랩 수는 올림", () => {
    const drivers = makePair(3.04);
    const data = makeData([
      ...lapsFor(1, [
        [8, 90.333],
        [9, 90.333],
        [10, 90.333],
      ]),
      ...lapsFor(2, [
        [8, 90.0],
        [9, 90.0],
        [10, 90.0],
      ]),
    ]);

    const forecasts = buildOvertakeForecasts(makeSnapshot(drivers), data, FAR_FUTURE_MS);

    expect(forecasts.length).toBe(1);
    // 3.04 → 3.0, 0.333 → 0.33.
    expect(forecasts[0]?.intervalSeconds).toBe(3.0);
    expect(forecasts[0]?.closingRateSecondsPerLap).toBe(0.33);
    // ceil((3.04 - 1.0) / 0.333) = ceil(6.126...) = 7 (원본 rate 로 계산, 올림).
    expect(forecasts[0]?.predictedLapsToBattle).toBe(7);
    expect(forecasts[0]?.predictedLap).toBe(17);
  });
});

describe("buildOvertakeForecasts — 발화 조건 경계", () => {
  const cleanLaps = (): OpenF1Lap[] => [
    ...lapsFor(1, [
      [8, 90.5],
      [9, 90.5],
      [10, 90.5],
    ]),
    ...lapsFor(2, [
      [8, 90.0],
      [9, 90.0],
      [10, 90.0],
    ]),
  ];

  it("interval 1.5 이하는 예측하지 않는다", () => {
    const forecasts = buildOvertakeForecasts(
      makeSnapshot(makePair(1.5)),
      makeData(cleanLaps()),
      FAR_FUTURE_MS,
    );

    expect(forecasts).toEqual([]);
  });

  it("잡는 속도가 0.15 미만이면 예측하지 않는다", () => {
    const data = makeData([
      ...lapsFor(1, [
        [8, 90.1],
        [9, 90.1],
        [10, 90.1],
      ]),
      ...lapsFor(2, [
        [8, 90.0],
        [9, 90.0],
        [10, 90.0],
      ]),
    ]);

    // delta 0.1 < 0.15.
    const forecasts = buildOvertakeForecasts(makeSnapshot(makePair(3.0)), data, FAR_FUTURE_MS);

    expect(forecasts).toEqual([]);
  });

  it("예측 랩 수가 10을 초과(11랩)하면 예측하지 않는다", () => {
    const data = makeData([
      ...lapsFor(1, [
        [8, 90.2],
        [9, 90.2],
        [10, 90.2],
      ]),
      ...lapsFor(2, [
        [8, 90.0],
        [9, 90.0],
        [10, 90.0],
      ]),
    ]);

    // rate 0.2, interval 3.2 → ceil((3.2 - 1.0) / 0.2) = ceil(11.0) = 11 > 10.
    const forecasts = buildOvertakeForecasts(makeSnapshot(makePair(3.2)), data, FAR_FUTURE_MS);

    expect(forecasts).toEqual([]);
  });

  it("예측 랩 수가 남은 랩을 초과하면 예측하지 않는다", () => {
    // 남은 랩 2(총 12랩, 현재 10랩). 예측 4랩 > 2.
    const snapshot = makeSnapshot(makePair(3.0), { totalLaps: 12, currentLap: 10 });
    const forecasts = buildOvertakeForecasts(snapshot, makeData(cleanLaps()), FAR_FUTURE_MS);

    expect(forecasts).toEqual([]);
  });

  it("totalLaps 가 null 이면 남은 랩 조건은 통과하되 maxLapsAhead 는 유지된다", () => {
    const snapshot = makeSnapshot(makePair(3.0), { totalLaps: null });
    const forecasts = buildOvertakeForecasts(snapshot, makeData(cleanLaps()), FAR_FUTURE_MS);

    // 남은 랩을 모르지만 4랩은 maxLapsAhead(10) 안이라 예측이 나온다.
    expect(forecasts.length).toBe(1);
    expect(forecasts[0]?.predictedLapsToBattle).toBe(4);
  });
});

describe("buildOvertakeForecasts — 상태·페어 제외", () => {
  const cleanLaps = (): OpenF1Lap[] => [
    ...lapsFor(1, [
      [8, 90.5],
      [9, 90.5],
      [10, 90.5],
    ]),
    ...lapsFor(2, [
      [8, 90.0],
      [9, 90.0],
      [10, 90.0],
    ]),
  ];

  it("SC 상태면 빈 배열이다", () => {
    const snapshot = makeSnapshot(makePair(3.0), { status: SessionStatus.SafetyCar });

    expect(buildOvertakeForecasts(snapshot, makeData(cleanLaps()), FAR_FUTURE_MS)).toEqual([]);
  });

  it("VSC 상태면 빈 배열이다", () => {
    const snapshot = makeSnapshot(makePair(3.0), {
      status: SessionStatus.VirtualSafetyCar,
    });

    expect(buildOvertakeForecasts(snapshot, makeData(cleanLaps()), FAR_FUTURE_MS)).toEqual([]);
  });

  it("Red 상태면 빈 배열이다", () => {
    const snapshot = makeSnapshot(makePair(3.0), { status: SessionStatus.Red });

    expect(buildOvertakeForecasts(snapshot, makeData(cleanLaps()), FAR_FUTURE_MS)).toEqual([]);
  });

  it("Yellow 상태에서는 예측한다", () => {
    const snapshot = makeSnapshot(makePair(3.0), { status: SessionStatus.Yellow });

    expect(
      buildOvertakeForecasts(snapshot, makeData(cleanLaps()), FAR_FUTURE_MS).length,
    ).toBe(1);
  });

  it("chaser 가 리타이어면 그 페어는 스킵한다", () => {
    const drivers = [
      makeDriver({ driverNumber: 1, position: 1 }),
      makeDriver({
        driverNumber: 2,
        position: 2,
        intervalToAheadSeconds: 3.0,
        retired: true,
      }),
    ];

    expect(buildOvertakeForecasts(makeSnapshot(drivers), makeData(cleanLaps()), FAR_FUTURE_MS)).toEqual([]);
  });

  it("target 이 피트인 중이면 그 페어는 스킵한다", () => {
    const drivers = [
      makeDriver({ driverNumber: 1, position: 1, inPit: true }),
      makeDriver({ driverNumber: 2, position: 2, intervalToAheadSeconds: 3.0 }),
    ];

    expect(buildOvertakeForecasts(makeSnapshot(drivers), makeData(cleanLaps()), FAR_FUTURE_MS)).toEqual([]);
  });

  it("interval 이 null 이면 그 페어는 스킵한다", () => {
    const drivers = [
      makeDriver({ driverNumber: 1, position: 1 }),
      makeDriver({ driverNumber: 2, position: 2, intervalToAheadSeconds: null }),
    ];

    expect(buildOvertakeForecasts(makeSnapshot(drivers), makeData(cleanLaps()), FAR_FUTURE_MS)).toEqual([]);
  });

  it("interval 이 60초를 넘으면(랩다운) 그 페어는 스킵한다", () => {
    expect(
      buildOvertakeForecasts(makeSnapshot(makePair(61.0)), makeData(cleanLaps()), FAR_FUTURE_MS),
    ).toEqual([]);
  });

  it("포지션에 구멍이 있으면(P1·P3) 인접 페어로 보지 않는다", () => {
    const drivers = [
      makeDriver({ driverNumber: 1, position: 1 }),
      makeDriver({ driverNumber: 3, position: 3, intervalToAheadSeconds: 3.0 }),
    ];

    expect(buildOvertakeForecasts(makeSnapshot(drivers), makeData(cleanLaps()), FAR_FUTURE_MS)).toEqual([]);
  });
});

describe("buildOvertakeForecasts — 정렬", () => {
  it("chaser position 오름차순으로 반환한다", () => {
    // P1↔P2, P3↔P4 두 페어. laps 는 모든 드라이버에 대칭으로 준다.
    const drivers = [
      makeDriver({ driverNumber: 1, position: 1 }),
      makeDriver({ driverNumber: 2, position: 2, intervalToAheadSeconds: 3.0 }),
      makeDriver({ driverNumber: 3, position: 3, intervalToAheadSeconds: 5.0 }),
      makeDriver({ driverNumber: 4, position: 4, intervalToAheadSeconds: 3.0 }),
    ];
    const data = makeData([
      ...lapsFor(1, [
        [8, 90.5],
        [9, 90.5],
        [10, 90.5],
      ]),
      ...lapsFor(2, [
        [8, 90.0],
        [9, 90.0],
        [10, 90.0],
      ]),
      ...lapsFor(3, [
        [8, 90.5],
        [9, 90.5],
        [10, 90.5],
      ]),
      ...lapsFor(4, [
        [8, 90.0],
        [9, 90.0],
        [10, 90.0],
      ]),
    ]);

    const forecasts = buildOvertakeForecasts(makeSnapshot(drivers), data, FAR_FUTURE_MS);

    expect(forecasts.map((forecast) => forecast.chaserNumber)).toEqual([2, 4]);
  });
});
