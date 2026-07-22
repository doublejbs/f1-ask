import { describe, expect, it } from "vitest";
import { LiveDriverState } from "../src/LiveDriverState";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import { SessionStatus } from "../src/SessionStatus";
import { TireCompound } from "../src/TireCompound";
import { OvertakeForecast } from "../src/openf1/OvertakeForecast";
import { buildOvertakeForecastEvent } from "../src/openf1/OvertakeForecastEvent";

const NOW = Date.parse("2026-07-19T13:30:00.000Z");

const makeDriver = (
  driverNumber: number,
  code: string,
): LiveDriverState => ({
  driverNumber,
  code,
  fullName: "Test Driver",
  teamName: "Test Team",
  position: driverNumber,
  startingPosition: driverNumber,
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
});

const makeSnapshot = (drivers: LiveDriverState[]): LiveRaceSnapshot => ({
  schemaVersion: 1,
  sessionId: "session-A",
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
  generatedAt: new Date(NOW).toISOString(),
  sourceUpdatedAt: new Date(NOW).toISOString(),
  version: 0,
});

const forecast: OvertakeForecast = {
  chaserNumber: 4,
  targetNumber: 1,
  intervalSeconds: 3.0,
  closingRateSecondsPerLap: 0.5,
  predictedLapsToBattle: 4,
  predictedLap: 14,
};

describe("buildOvertakeForecastEvent — 필드 매핑", () => {
  const snapshot = makeSnapshot([makeDriver(1, "VER"), makeDriver(4, "NOR")]);

  it("타입·우선순위·범위 필드를 규약대로 채운다", () => {
    const event = buildOvertakeForecastEvent(forecast, snapshot, NOW);

    expect(event.type).toBe(RaceEventType.OvertakeForecast);
    expect(event.priority).toBe(RaceEventPriority.Medium);
    expect(event.sessionId).toBe("session-A");
    expect(event.driverNumber).toBe(4);
    expect(event.targetDriverNumber).toBe(1);
    expect(event.lapNumber).toBe(14);
    expect(event.timestamp).toBe(new Date(NOW).toISOString());
  });

  it("params 에 chaser·target 코드와 예측 수치를 그대로 싣는다", () => {
    const event = buildOvertakeForecastEvent(forecast, snapshot, NOW);

    expect(event.params).toMatchObject({
      driverCode: "NOR",
      targetDriverCode: "VER",
      chaserNumber: 4,
      targetNumber: 1,
      intervalSeconds: 3.0,
      closingRateSecondsPerLap: 0.5,
      predictedLapsToBattle: 4,
      predictedLap: 14,
    });
  });

  it("params 에 chaser·target 의 타이어 데이터를 싣는다", () => {
    const chaserDriver = makeDriver(4, "NOR");
    chaserDriver.compound = TireCompound.Soft;
    chaserDriver.tireAgeLaps = 5;

    const targetDriver = makeDriver(1, "VER");
    targetDriver.compound = TireCompound.Hard;
    targetDriver.tireAgeLaps = 12;

    const snapshotWithTires = makeSnapshot([targetDriver, chaserDriver]);
    const event = buildOvertakeForecastEvent(forecast, snapshotWithTires, NOW);

    expect(event.params).toMatchObject({
      chaserCompound: TireCompound.Soft,
      chaserTireAgeLaps: 5,
      targetCompound: TireCompound.Hard,
      targetTireAgeLaps: 12,
    });
  });

  it("스냅샷에 드라이버가 없으면 타이어 필드는 null 이다", () => {
    const event = buildOvertakeForecastEvent(forecast, makeSnapshot([]), NOW);

    expect(event.params.chaserCompound).toBeNull();
    expect(event.params.chaserTireAgeLaps).toBeNull();
    expect(event.params.targetCompound).toBeNull();
    expect(event.params.targetTireAgeLaps).toBeNull();
  });

  it("스냅샷에 없는 드라이버 코드는 빈 문자열로 채운다", () => {
    const event = buildOvertakeForecastEvent(forecast, makeSnapshot([]), NOW);

    expect(event.params.driverCode).toBe("");
    expect(event.params.targetDriverCode).toBe("");
  });
});

describe("buildOvertakeForecastEvent — key 결정성", () => {
  const snapshot = makeSnapshot([makeDriver(1, "VER"), makeDriver(4, "NOR")]);

  it("같은 forecast(같은 chaser·target·predictedLap)는 같은 deduplicationKey 를 낸다", () => {
    const first = buildOvertakeForecastEvent(forecast, snapshot, NOW);
    // 시각이 달라도 key 는 chaser·target·predictedLap 로만 결정된다 — 재폴링 중복 쓰기를 막는다.
    const second = buildOvertakeForecastEvent(forecast, snapshot, NOW + 6000);

    expect(first.deduplicationKey).toBe(second.deduplicationKey);
    expect(first.id).toBe(first.deduplicationKey);
    expect(first.deduplicationKey).toContain(
      "overtake_forecast:4:1:14",
    );
  });

  it("predictedLap 이 다르면 key 도 달라진다", () => {
    const later = buildOvertakeForecastEvent(
      { ...forecast, predictedLap: 15 },
      snapshot,
      NOW,
    );
    const earlier = buildOvertakeForecastEvent(forecast, snapshot, NOW);

    expect(later.deduplicationKey).not.toBe(earlier.deduplicationKey);
  });
});
