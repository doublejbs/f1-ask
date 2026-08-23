import { describe, expect, it } from "vitest";
import { LiveDriverState } from "../src/LiveDriverState";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { SessionStatus } from "../src/SessionStatus";
import { TireCompound } from "../src/TireCompound";
import { OvertakeForecastConfidence } from "../src/openf1/OvertakeForecastConfidence";
import { toQuestionSummaryContext } from "../src/ai/QuestionSummaryContext";

const driver = (driverNumber: number, code: string): LiveDriverState => ({
  driverNumber,
  code,
  fullName: code,
  teamName: "Team",
  position: driverNumber,
  startingPosition: driverNumber,
  positionChange: 0,
  gapToLeaderSeconds: null,
  intervalToAheadSeconds: null,
  intervalToBehindSeconds: null,
  lastLapSeconds: null,
  personalBestLapSeconds: null,
  compound: TireCompound.Soft,
  tireAgeLaps: null,
  pitStopCount: 0,
  inPit: false,
  retired: false,
  recentLapTimesSeconds: [],
});

const baseSnapshot: LiveRaceSnapshot = {
  schemaVersion: 1,
  sessionId: "s",
  sessionKey: 1,
  meetingKey: 1,
  sessionName: "Race",
  sessionType: "Race",
  circuitName: "c",
  countryCode: "TST",
  status: SessionStatus.Green,
  currentLap: 30,
  totalLaps: 50,
  drivers: [driver(4, "NOR"), driver(1, "VER")],
  generatedAt: "2026-07-19T13:00:00.000Z",
  sourceUpdatedAt: "2026-07-19T13:00:00.000Z",
  version: 1,
};

describe("toQuestionSummaryContext — 예측·타이어 전략 적재 (C1·C4)", () => {
  it("데이터가 없으면(mock) null 을 준다", () => {
    expect(toQuestionSummaryContext(baseSnapshot)).toBeNull();
  });

  it("추월 예측을 코드·랩·신뢰도로 싣는다 (C4)", () => {
    const context = toQuestionSummaryContext({
      ...baseSnapshot,
      overtakeForecasts: [
        {
          chaserNumber: 4,
          targetNumber: 1,
          intervalSeconds: 2.4,
          closingRateSecondsPerLap: 0.4,
          predictedLapsToBattle: 3,
          predictedLap: 33,
          confidence: OvertakeForecastConfidence.High,
        },
      ],
    });

    expect(context?.overtakeForecasts).toEqual([
      { chaser: "NOR", target: "VER", inLaps: 3, confidence: "high", gapSeconds: 2.4 },
    ]);
  });

  it("드라이버 타이어 전략을 사용 이력 + 규정 잔여로 싣는다 (C1)", () => {
    const context = toQuestionSummaryContext({
      ...baseSnapshot,
      contextSummary: {
        pits: { totalStops: 0, medianDurationSeconds: null },
        stints: [
          {
            driverNumber: 4,
            stintCount: 2,
            currentStintStartLap: 20,
            previousCompound: TireCompound.Medium,
            lastPitLap: 19,
            usedCompounds: [
              { compound: TireCompound.Medium, startedNew: true },
              { compound: TireCompound.Soft, startedNew: true },
            ],
          },
        ],
        overtakes: { total: 0, mostActiveDriverNumber: null, mostActiveCount: 0 },
      },
    });

    const nor = context?.tireStrategy?.[0];

    expect(nor?.code).toBe("NOR");
    expect(nor?.setsRemaining).toBe(7);
    expect(nor?.usedCompounds).toEqual([
      { compound: "MEDIUM", new: true },
      { compound: "SOFT", new: true },
    ]);
    // 레이스 신품 M·S 각 1 + 의무 보유(H1·M1) → 하한 H1·M1·S1 → soft/medium 최소 1 이상.
    expect(nor?.remaining.medium[0]).toBeGreaterThanOrEqual(1);
    expect(nor?.remaining.soft[0]).toBeGreaterThanOrEqual(1);
    expect(nor?.remaining.hard[0]).toBeGreaterThanOrEqual(1);
    // 집계(피트·추월)도 그대로 펴져 있다.
    expect(context?.pits.totalStops).toBe(0);
  });
});
