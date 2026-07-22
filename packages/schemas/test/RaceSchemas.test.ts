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
