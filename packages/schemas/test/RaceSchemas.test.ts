import { DEFAULT_MOCK_SCENARIO, MockRaceEngine } from "@f1/domain";
import { describe, expect, it } from "vitest";
import { parseRaceEvents } from "../src/RaceEventSchema";
import { parseLiveRaceSnapshot } from "../src/RaceSnapshotSchema";
import { parsePublicFirebaseEnv, publicAppEnvSchema } from "../src/EnvSchema";

const engine = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
);

describe("race schemas", () => {
  it("엔진이 생성한 snapshot 을 스키마가 통과시킨다", () => {
    const { snapshot } = engine.snapshotAt(70);

    expect(() => parseLiveRaceSnapshot(snapshot)).not.toThrow();
  });

  it("엔진이 생성한 events 를 스키마가 통과시킨다", () => {
    const { events } = engine.snapshotAt(122);

    expect(() => parseRaceEvents(events)).not.toThrow();
    expect(events.length).toBeGreaterThan(0);
  });

  it("잘못된 snapshot 은 거부한다", () => {
    expect(() => parseLiveRaceSnapshot({ sessionId: 123 })).toThrow();
  });

  it("contextSummary 가 없어도 통과한다 (optional — mock·옛 스냅샷 안전)", () => {
    const { snapshot } = engine.snapshotAt(70);

    // 엔진 스냅샷엔 contextSummary 가 없다.
    expect(snapshot.contextSummary).toBeUndefined();
    expect(() => parseLiveRaceSnapshot(snapshot)).not.toThrow();
  });

  it("contextSummary 가 있으면 파싱 후에도 보존된다 (경계에서 스트립되지 않음)", () => {
    const { snapshot } = engine.snapshotAt(70);
    const withSummary = {
      ...snapshot,
      contextSummary: {
        pits: { totalStops: 28, medianDurationSeconds: 24.7365 },
        stints: [
          {
            driverNumber: 44,
            stintCount: 2,
            currentStintStartLap: 21,
            previousCompound: "MEDIUM",
            lastPitLap: 20,
          },
        ],
        overtakes: {
          total: 214,
          mostActiveDriverNumber: 4,
          mostActiveCount: 9,
        },
      },
    };

    const parsed = parseLiveRaceSnapshot(withSummary);

    // /api/ask 는 이 스키마로 스냅샷을 파싱한다. 필드가 스키마에 없으면 zod 가 조용히
    // 스트립해 요약이 provider 까지 못 간다 — 그 회귀를 여기서 막는다.
    expect(parsed.contextSummary).toEqual(withSummary.contextSummary);
  });

  it("narrative 가 있으면 파싱 후에도 보존된다 (경계에서 스트립되지 않음)", () => {
    const { snapshot } = engine.snapshotAt(70);
    const withNarrative = {
      ...snapshot,
      contextSummary: {
        pits: { totalStops: 28, medianDurationSeconds: 24.7365 },
        stints: [],
        overtakes: {
          total: 214,
          mostActiveDriverNumber: 4,
          mostActiveCount: 9,
        },
        narrative: {
          progress: { currentLap: 26, totalLaps: 44, phase: "green" },
          leadChanges: [1, 4, 1],
          retirements: [
            { driverNumber: 18, lap: 26 },
            { driverNumber: 11, lap: 14 },
          ],
          pitWaves: [{ startLap: 14, endLap: 18, count: 8 }],
          biggestMovers: [{ driverNumber: 63, from: 16, to: 5, delta: 11 }],
          fastestLap: { driverNumber: 4, lapSeconds: 104.321, lap: 33 },
          weatherShifts: [{ lap: 20, toWet: true }],
          safetyCars: [{ kind: "sc", startLap: 14 }],
        },
      },
    };

    const parsed = parseLiveRaceSnapshot(withNarrative);

    // narrative 를 스키마에 넣지 않으면 zod 가 조용히 스트립해 provider 까지 못 간다 (docs/25 §계약 확장).
    expect(parsed.contextSummary?.narrative).toEqual(
      withNarrative.contextSummary.narrative,
    );
  });

  it("narrative 가 없는 contextSummary 도 통과한다 (narrative optional)", () => {
    const { snapshot } = engine.snapshotAt(70);
    const withSummaryNoNarrative = {
      ...snapshot,
      contextSummary: {
        pits: { totalStops: 28, medianDurationSeconds: 24.7365 },
        stints: [],
        overtakes: {
          total: 214,
          mostActiveDriverNumber: 4,
          mostActiveCount: 9,
        },
      },
    };

    const parsed = parseLiveRaceSnapshot(withSummaryNoNarrative);

    expect(parsed.contextSummary?.narrative).toBeUndefined();
  });

  it("narrative 하위 필드가 비어도 안전하다 (빈 배열·fastestLap null)", () => {
    const { snapshot } = engine.snapshotAt(70);
    const withSparseNarrative = {
      ...snapshot,
      contextSummary: {
        pits: { totalStops: 0, medianDurationSeconds: null },
        stints: [],
        overtakes: {
          total: 0,
          mostActiveDriverNumber: null,
          mostActiveCount: 0,
        },
        narrative: {
          progress: { currentLap: null, totalLaps: null, phase: "green" },
          leadChanges: [],
          retirements: [],
          pitWaves: [],
          biggestMovers: [],
          fastestLap: null,
          weatherShifts: [],
          safetyCars: [],
        },
      },
    };

    const parsed = parseLiveRaceSnapshot(withSparseNarrative);

    expect(parsed.contextSummary?.narrative?.fastestLap).toBeNull();
    expect(parsed.contextSummary?.narrative?.retirements).toEqual([]);
  });

  it("overtakeForecasts 가 없어도 통과한다 (optional — mock·옛 스냅샷 안전)", () => {
    const { snapshot } = engine.snapshotAt(70);

    expect(snapshot.overtakeForecasts).toBeUndefined();
    expect(() => parseLiveRaceSnapshot(snapshot)).not.toThrow();
  });

  it("overtakeForecasts 가 있으면 파싱 후에도 보존된다", () => {
    const { snapshot } = engine.snapshotAt(70);
    const withForecasts = {
      ...snapshot,
      overtakeForecasts: [
        {
          chaserNumber: 4,
          targetNumber: 1,
          intervalSeconds: 3.0,
          closingRateSecondsPerLap: 0.5,
          predictedLapsToBattle: 4,
          predictedLap: 14,
        },
      ],
    };

    const parsed = parseLiveRaceSnapshot(withForecasts);

    expect(parsed.overtakeForecasts).toEqual(withForecasts.overtakeForecasts);
  });
});

describe("env schemas", () => {
  it("Firebase 설정 누락 시 오류를 던진다", () => {
    expect(() => parsePublicFirebaseEnv({})).toThrow();
  });

  it("데이터 모드 기본값은 mock 이다", () => {
    const parsed = publicAppEnvSchema.parse({});

    expect(parsed.NEXT_PUBLIC_DATA_MODE).toBe("mock");
    expect(parsed.NEXT_PUBLIC_USE_FIREBASE_EMULATOR).toBe(false);
  });
});
