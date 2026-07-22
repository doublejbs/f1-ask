import { describe, expect, it } from "vitest";
import { LiveDriverState } from "../src/LiveDriverState";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { SessionStatus } from "../src/SessionStatus";
import { TireCompound } from "../src/TireCompound";
import { OvertakeForecast } from "../src/openf1/OvertakeForecast";
import { OvertakeForecastTracker } from "../src/openf1/OvertakeForecastTracker";

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

const makeSnapshot = (
  drivers: LiveDriverState[],
  currentLap: number | null = 10,
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
  currentLap,
  totalLaps: 50,
  drivers,
  generatedAt: "2026-07-19T13:15:00.000Z",
  sourceUpdatedAt: "2026-07-19T13:15:00.000Z",
  version: 1,
});

const makeForecast = (
  chaserNumber: number,
  targetNumber: number,
): OvertakeForecast => ({
  chaserNumber,
  targetNumber,
  intervalSeconds: 3.0,
  closingRateSecondsPerLap: 0.5,
  predictedLapsToBattle: 4,
  predictedLap: 14,
});

// chaser·target 두 드라이버만 담은 스냅샷을 만든다.
const pairSnapshot = (
  chaserNumber: number,
  targetNumber: number,
  overrides: {
    chaserPitStopCount?: number;
    targetPitStopCount?: number;
    chaserRetired?: boolean;
    targetRetired?: boolean;
    currentLap?: number | null;
  } = {},
): LiveRaceSnapshot =>
  makeSnapshot(
    [
      makeDriver({
        driverNumber: targetNumber,
        position: 1,
        pitStopCount: overrides.targetPitStopCount ?? 0,
        retired: overrides.targetRetired ?? false,
      }),
      makeDriver({
        driverNumber: chaserNumber,
        position: 2,
        pitStopCount: overrides.chaserPitStopCount ?? 0,
        retired: overrides.chaserRetired ?? false,
      }),
    ],
    overrides.currentLap ?? 10,
  );

describe("OvertakeForecastTracker", () => {
  it("첫 성립 시 1회만 반환하고 유지 중에는 재반환하지 않는다", () => {
    const tracker = new OvertakeForecastTracker();
    const forecast = makeForecast(2, 1);
    const snapshot = pairSnapshot(2, 1);

    const first = tracker.observe([forecast], snapshot);

    expect(first.length).toBe(1);
    expect(first[0]?.chaserNumber).toBe(2);
    expect(first[0]?.targetNumber).toBe(1);

    // 같은 페어가 유지되면 재반환하지 않는다.
    expect(tracker.observe([forecast], snapshot)).toEqual([]);
    expect(tracker.observe([forecast], snapshot)).toEqual([]);
  });

  it("한 랩 이상 온전히 부재한 뒤 다시 성립하면 재반환한다", () => {
    const tracker = new OvertakeForecastTracker();
    const forecast = makeForecast(2, 1);

    expect(tracker.observe([forecast], pairSnapshot(2, 1, { currentLap: 10 })).length).toBe(1);

    // 소프트 소멸 시작(L10). 인접은 유지되지만 forecasts 목록에서만 빠졌다 — 아직 디바운스 중이라
    // 재무장하지 않는다.
    expect(tracker.observe([], pairSnapshot(2, 1, { currentLap: 10 }))).toEqual([]);

    // 부재가 한 랩(L10→L12) 온전히 지속 → 이때 비로소 재무장한다.
    expect(tracker.observe([], pairSnapshot(2, 1, { currentLap: 12 }))).toEqual([]);

    // 다시 성립 → 재반환.
    const again = tracker.observe([forecast], pairSnapshot(2, 1, { currentLap: 12 }));

    expect(again.length).toBe(1);
    expect(again[0]?.chaserNumber).toBe(2);
  });

  it("같은 랩 안 flicker(있다→없다→있다)는 재발화하지 않는다", () => {
    const tracker = new OvertakeForecastTracker();
    const forecast = makeForecast(2, 1);
    const snapshot = pairSnapshot(2, 1, { currentLap: 20 });

    // 임계값 주변 폴링 잡음으로 같은 랩 안에서 예측이 한 프레임 빠졌다 돌아오는 상황 — 재무장 금지.
    expect(tracker.observe([forecast], snapshot).length).toBe(1);
    expect(tracker.observe([], snapshot)).toEqual([]);
    expect(tracker.observe([forecast], snapshot)).toEqual([]);
    expect(tracker.observe([], snapshot)).toEqual([]);
    expect(tracker.observe([forecast], snapshot)).toEqual([]);
  });

  it("부재가 2랩 지속된 뒤 재성립하면 재발화한다", () => {
    const tracker = new OvertakeForecastTracker();
    const forecast = makeForecast(2, 1);

    expect(tracker.observe([forecast], pairSnapshot(2, 1, { currentLap: 30 })).length).toBe(1);

    // 부재 L30 시작 → L31, L32 까지 지속. L32 = 30 + 2 이므로 재무장.
    expect(tracker.observe([], pairSnapshot(2, 1, { currentLap: 30 }))).toEqual([]);
    expect(tracker.observe([], pairSnapshot(2, 1, { currentLap: 31 }))).toEqual([]);
    expect(tracker.observe([], pairSnapshot(2, 1, { currentLap: 32 }))).toEqual([]);

    // 재성립 → 재발화.
    expect(tracker.observe([forecast], pairSnapshot(2, 1, { currentLap: 32 })).length).toBe(1);
  });

  it("부재 중 하드 해체(피트)는 소프트 2랩 디바운스를 기다리지 않고 즉시 재무장한다", () => {
    const tracker = new OvertakeForecastTracker();
    const forecast = makeForecast(2, 1);

    expect(tracker.observe([forecast], pairSnapshot(2, 1, { currentLap: 40 })).length).toBe(1);

    // 소프트 소멸 시작(L40) — 아직 디바운스 중.
    expect(tracker.observe([], pairSnapshot(2, 1, { currentLap: 40 }))).toEqual([]);

    // 다음 랩(L41)에 chaser 가 피트인해 재성립. 소프트라면 L42(=40+2)까지 기다렸겠지만,
    // 피트는 하드 해체라 활성이 즉시 풀려 한 랩만 넘어가도 재발화한다.
    expect(
      tracker.observe([forecast], pairSnapshot(2, 1, { currentLap: 41, chaserPitStopCount: 1 }))
        .length,
    ).toBe(1);
  });

  it("부재 중 순위 비인접(제3자 개입)은 즉시 재무장한다", () => {
    const tracker = new OvertakeForecastTracker();

    // 2(P2)가 1(P1)을 쫓는다.
    expect(tracker.observe([makeForecast(2, 1)], pairSnapshot(2, 1, { currentLap: 40 })).length).toBe(1);

    // 소프트 소멸 시작.
    expect(tracker.observe([], pairSnapshot(2, 1, { currentLap: 40 }))).toEqual([]);

    // 제3자(3)가 둘 사이에 끼어들어 chaser 2 가 P3 로 밀린다 — 더 이상 순위 인접이 아니라 즉시 재무장.
    const wedged = makeSnapshot(
      [
        makeDriver({ driverNumber: 1, position: 1 }),
        makeDriver({ driverNumber: 3, position: 2 }),
        makeDriver({ driverNumber: 2, position: 3 }),
      ],
      41,
    );

    expect(tracker.observe([], wedged)).toEqual([]);

    // 다시 인접 복원 후 재성립 → 재발화(다음 랩이라 같은 랩 억제에도 걸리지 않는다).
    expect(tracker.observe([makeForecast(2, 1)], pairSnapshot(2, 1, { currentLap: 41 })).length).toBe(1);
  });

  it("하드 해체 후에도 같은 랩 안에서는 재발화하지 않는다(성립 순간 1회/랩)", () => {
    const tracker = new OvertakeForecastTracker();
    const forecast = makeForecast(2, 1);

    // L20 에 성립·발화.
    expect(tracker.observe([forecast], pairSnapshot(2, 1, { currentLap: 20 })).length).toBe(1);

    // 같은 랩 L20 에 피트(하드 해체) → 활성은 즉시 풀리지만, 피트 아웃 지터로 같은 랩에 예측이
    // 되돌아와도 발화는 삼킨다. "N랩 후 배틀" 예측이 한 랩에 두 번 나오는 것은 무의미한 소음이다.
    expect(
      tracker.observe([forecast], pairSnapshot(2, 1, { currentLap: 20, chaserPitStopCount: 1 })),
    ).toEqual([]);
    expect(
      tracker.observe([forecast], pairSnapshot(2, 1, { currentLap: 20, chaserPitStopCount: 1 })),
    ).toEqual([]);
  });

  it("currentLap 이 null 인 프레임에서는 디바운스 판정을 보류하고 상태를 유지한다", () => {
    const tracker = new OvertakeForecastTracker();
    const forecast = makeForecast(2, 1);

    expect(tracker.observe([forecast], pairSnapshot(2, 1, { currentLap: 50 })).length).toBe(1);

    // 부재 시작(L50).
    expect(tracker.observe([], pairSnapshot(2, 1, { currentLap: 50 }))).toEqual([]);

    // currentLap null 프레임 — 랩 격차를 잴 수 없으므로 재무장하지 않고 상태 유지.
    expect(tracker.observe([], pairSnapshot(2, 1, { currentLap: null }))).toEqual([]);
    expect(tracker.observe([], pairSnapshot(2, 1, { currentLap: null }))).toEqual([]);

    // null 프레임에서 재성립하면 발화 없이 활성 복원(디바운스 중이었으므로 재무장 안 됨).
    expect(tracker.observe([forecast], pairSnapshot(2, 1, { currentLap: null }))).toEqual([]);
  });

  it("피트(pitStopCount 증가) 후 다음 랩에 다시 성립하면 재반환한다", () => {
    const tracker = new OvertakeForecastTracker();
    const forecast = makeForecast(2, 1);

    expect(tracker.observe([forecast], pairSnapshot(2, 1, { currentLap: 10 })).length).toBe(1);

    // 다음 랩(L11)에 chaser 가 피트인해 pitStopCount 가 늘고 예측도 유지되는 프레임 → 하드 해체
    // 후 즉시 재무장, 랩이 넘어갔으므로 재반환한다.
    const afterPit = tracker.observe(
      [forecast],
      pairSnapshot(2, 1, { currentLap: 11, chaserPitStopCount: 1 }),
    );

    expect(afterPit.length).toBe(1);
    expect(afterPit[0]?.chaserNumber).toBe(2);

    // 재반환 후에는 다시 안정 상태이므로 재반환하지 않는다.
    expect(
      tracker.observe([forecast], pairSnapshot(2, 1, { currentLap: 11, chaserPitStopCount: 1 })),
    ).toEqual([]);
  });

  it("리타이어 후 다음 랩에 다시 성립하면 재반환한다", () => {
    const tracker = new OvertakeForecastTracker();
    const forecast = makeForecast(2, 1);

    expect(tracker.observe([forecast], pairSnapshot(2, 1, { currentLap: 10 })).length).toBe(1);

    // target 리타이어 프레임(예측은 소멸했다고 가정) → 하드 해체로 즉시 재무장.
    expect(
      tracker.observe([], pairSnapshot(2, 1, { currentLap: 10, targetRetired: true })),
    ).toEqual([]);

    // 다음 랩에 복귀·재성립 → 재반환.
    expect(tracker.observe([forecast], pairSnapshot(2, 1, { currentLap: 11 })).length).toBe(1);
  });

  it("순위 변동으로 페어가 해체된 뒤 다음 랩에 재성립하면 재반환한다", () => {
    const tracker = new OvertakeForecastTracker();

    // 처음엔 2 가 1 을 쫓는다(L10).
    expect(tracker.observe([makeForecast(2, 1)], pairSnapshot(2, 1, { currentLap: 10 })).length).toBe(1);

    // 순위가 뒤집혀 이제 1 이 2 를 쫓는다(L11) — 페어 키가 달라져 옛 페어는 하드 해체된다.
    const swapped = tracker.observe([makeForecast(1, 2)], pairSnapshot(1, 2, { currentLap: 11 }));

    expect(swapped.length).toBe(1);
    expect(swapped[0]?.chaserNumber).toBe(1);
    expect(swapped[0]?.targetNumber).toBe(2);

    // 다시 원래 방향으로 돌아오면(L12) 그 페어도 새로 성립한 것으로 재반환한다.
    const back = tracker.observe([makeForecast(2, 1)], pairSnapshot(2, 1, { currentLap: 12 }));

    expect(back.length).toBe(1);
    expect(back[0]?.chaserNumber).toBe(2);
  });

  it("동시에 여러 페어가 처음 성립하면 모두 반환한다", () => {
    const tracker = new OvertakeForecastTracker();
    const snapshot = makeSnapshot([
      makeDriver({ driverNumber: 1, position: 1 }),
      makeDriver({ driverNumber: 2, position: 2 }),
      makeDriver({ driverNumber: 3, position: 3 }),
      makeDriver({ driverNumber: 4, position: 4 }),
    ]);

    const emitted = tracker.observe(
      [makeForecast(2, 1), makeForecast(4, 3)],
      snapshot,
    );

    expect(emitted.map((forecast) => forecast.chaserNumber)).toEqual([2, 4]);

    // 유지되면 재반환 없음.
    expect(
      tracker.observe([makeForecast(2, 1), makeForecast(4, 3)], snapshot),
    ).toEqual([]);
  });
});
