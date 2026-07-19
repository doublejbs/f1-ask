import { describe, expect, it } from "vitest";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { recordRace, ReplayRaceSource } from "../src/ReplayRaceSource";

const START_EPOCH = Date.parse("2026-07-19T05:00:00.000Z");

const createEngine = (): MockRaceEngine =>
  new MockRaceEngine(DEFAULT_MOCK_SCENARIO, START_EPOCH);

describe("recordRace", () => {
  it("소스 전체 길이를 간격 단위로 녹화한다", () => {
    const engine = createEngine();
    const recording = recordRace(engine, 1);

    expect(recording.durationSeconds).toBe(engine.durationSeconds);
    expect(recording.frames.length).toBe(engine.durationSeconds + 1);
    expect(recording.frames[0]?.atSecond).toBe(0);
  });

  it("간격이 0 이하이면 오류를 던진다", () => {
    expect(() => recordRace(createEngine(), 0)).toThrow();
  });
});

describe("ReplayRaceSource", () => {
  it("빈 녹화본은 거부한다", () => {
    expect(
      () =>
        new ReplayRaceSource({
          durationSeconds: 0,
          intervalSeconds: 1,
          frames: [],
        }),
    ).toThrow();
  });

  it("Mock 을 녹화해 재생하면 녹화 시점 프레임과 동일하다", () => {
    const recording = recordRace(createEngine(), 1);
    const replay = new ReplayRaceSource(recording);
    const engine = createEngine();

    for (const atSecond of [0, 30, 70, 122]) {
      expect(replay.frameAt(atSecond)).toEqual(engine.frameAt(atSecond));
    }
  });

  it("녹화 간격 사이 시각은 직전 프레임을 반환한다", () => {
    const recording = recordRace(createEngine(), 1);
    const replay = new ReplayRaceSource(recording);

    // 30.7초는 30초 프레임을 반환해야 한다.
    expect(replay.frameAt(30.7)).toEqual(replay.frameAt(30));
  });

  it("범위를 벗어난 시각은 처음/마지막 프레임으로 클램프한다", () => {
    const recording = recordRace(createEngine(), 1);
    const replay = new ReplayRaceSource(recording);

    expect(replay.frameAt(-10)).toEqual(replay.frameAt(0));
    expect(replay.frameAt(9999)).toEqual(
      replay.frameAt(replay.durationSeconds),
    );
  });

  it("RaceDataSource 로서 Mock 과 동일한 인터페이스를 만족한다", () => {
    const replay = new ReplayRaceSource(recordRace(createEngine(), 1));

    expect(replay.durationSeconds).toBe(DEFAULT_MOCK_SCENARIO.durationSeconds);
    expect(replay.frameAt(50).snapshot.drivers).toHaveLength(20);
  });
});
