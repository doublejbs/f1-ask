import { describe, expect, it } from "vitest";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { SessionStatus } from "../src/SessionStatus";
import { WeatherState } from "../src/WeatherState";
import {
  detectWeatherTransition,
  WeatherTransitionKind,
  WeatherTransitionTracker,
} from "../src/WeatherTransition";

const weather = (rainfall: boolean): WeatherState => ({
  airTemperatureCelsius: 24,
  trackTemperatureCelsius: 38,
  humidityPercent: 55,
  rainfall,
});

let counter = 0;
const snapshot = (
  rainfall: boolean | null,
  currentLap: number | null,
  sessionId = "test",
): LiveRaceSnapshot => {
  counter += 1;

  return {
    schemaVersion: 1,
    sessionId,
    sessionKey: 1,
    meetingKey: 1,
    sessionName: "Race",
    sessionType: "Race",
    circuitName: "test",
    countryCode: "TST",
    status: SessionStatus.Green,
    currentLap,
    totalLaps: 50,
    drivers: [],
    weather: rainfall === null ? undefined : weather(rainfall),
    generatedAt: new Date(1_700_000_000_000 + counter * 6_000).toISOString(),
    sourceUpdatedAt: new Date(1_700_000_000_000 + counter * 6_000).toISOString(),
    version: counter,
  };
};

describe("detectWeatherTransition", () => {
  it("건조→비면 RainStarting", () => {
    expect(detectWeatherTransition(false, true)).toBe(
      WeatherTransitionKind.RainStarting,
    );
  });

  it("비→건조면 TrackDrying", () => {
    expect(detectWeatherTransition(true, false)).toBe(
      WeatherTransitionKind.TrackDrying,
    );
  });

  it("변화 없음·미상이면 null", () => {
    expect(detectWeatherTransition(true, true)).toBeNull();
    expect(detectWeatherTransition(false, false)).toBeNull();
    expect(detectWeatherTransition(null, true)).toBeNull();
    expect(detectWeatherTransition(true, null)).toBeNull();
  });
});

describe("WeatherTransitionTracker", () => {
  it("첫 관측은 기준선만 잡고 전환을 내지 않는다", () => {
    const tracker = new WeatherTransitionTracker();
    expect(tracker.observe(snapshot(false, 1))).toBeNull();
  });

  it("비가 시작되면 배너를 내고 창(3랩) 동안 유지, 이후 사라진다", () => {
    const tracker = new WeatherTransitionTracker(3);

    tracker.observe(snapshot(false, 10)); // 기준선
    const started = tracker.observe(snapshot(true, 11)); // 전환

    expect(started?.kind).toBe(WeatherTransitionKind.RainStarting);
    expect(started?.lap).toBe(11);

    // 창 안(11→13)에서는 유지.
    expect(tracker.observe(snapshot(true, 13))?.kind).toBe(
      WeatherTransitionKind.RainStarting,
    );
    // 창 밖(11→15)에서는 조용.
    expect(tracker.observe(snapshot(true, 15))).toBeNull();
  });

  it("세션이 바뀌면 이전 날씨 기억이 초기화된다(오발화 방지)", () => {
    const tracker = new WeatherTransitionTracker();

    tracker.observe(snapshot(true, 40, "race-A"));
    // 다른 세션의 첫 프레임은 기준선만 — 비→건조로 오발화하지 않는다.
    expect(tracker.observe(snapshot(false, 1, "race-B"))).toBeNull();
  });
});
