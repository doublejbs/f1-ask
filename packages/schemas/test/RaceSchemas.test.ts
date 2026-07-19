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
