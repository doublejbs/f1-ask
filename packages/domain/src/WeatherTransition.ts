import { LiveRaceSnapshot } from "./LiveRaceSnapshot";

// 날씨 전환 신호 (B3). 비가 시작되거나 트랙이 마르면 타이어·전략이 통째로 바뀐다 —
// 슬릭 ↔ 인터 ↔ 웨트. 세션 전체에 영향을 주는 사건이라 드라이버별 "지금 볼 것"(A~F)과
// 달리 세션 레벨 배너로 크게 알린다. rainfall(불리언) 이 뒤집히는 것으로 감지한다.
export enum WeatherTransitionKind {
  RainStarting = "rain_starting",
  TrackDrying = "track_drying",
}

export type WeatherTransition = {
  kind: WeatherTransitionKind;
  // 전환이 감지된 세션 랩(없으면 null).
  lap: number | null;
};

// 전환 후 이 랩 수 동안 배너를 유지한다(전략 반응 창). 이후에는 조용해진다.
export const DEFAULT_WEATHER_TRANSITION_WINDOW_LAPS = 3;

// 이전→현재 rainfall 변화로 전환 종류를 낸다. 변화 없으면 null. (순수 함수 — 테스트 용이)
export const detectWeatherTransition = (
  previousRainfall: boolean | null,
  currentRainfall: boolean | null,
): WeatherTransitionKind | null => {
  if (previousRainfall === null || currentRainfall === null) {
    return null;
  }

  if (previousRainfall === currentRainfall) {
    return null;
  }

  return currentRainfall
    ? WeatherTransitionKind.RainStarting
    : WeatherTransitionKind.TrackDrying;
};

// 프레임 간 상태로 날씨 전환을 추적하고, 최근 전환이면 배너를 돌려준다.
// WatchNowFeed 와 같은 패턴 — 세션당 인스턴스 하나를 두고 스냅샷마다 observe 한다.
export class WeatherTransitionTracker {
  private previousRainfall: boolean | null = null;
  private lastTransition: WeatherTransition | null = null;
  private lastTransitionLap: number | null = null;
  private lastSessionId: string | null = null;

  constructor(
    private readonly windowLaps = DEFAULT_WEATHER_TRANSITION_WINDOW_LAPS,
  ) {}

  // 스냅샷을 관측하고, 지금 노출할 전환(최근 창 안)이 있으면 돌려준다.
  observe(snapshot: LiveRaceSnapshot): WeatherTransition | null {
    // 세션이 바뀌면 이전 날씨 기억은 무의미하다.
    if (
      this.lastSessionId !== null &&
      this.lastSessionId !== snapshot.sessionId
    ) {
      this.previousRainfall = null;
      this.lastTransition = null;
      this.lastTransitionLap = null;
    }

    this.lastSessionId = snapshot.sessionId;

    const currentRainfall = snapshot.weather?.rainfall ?? null;
    const transition = detectWeatherTransition(
      this.previousRainfall,
      currentRainfall,
    );

    if (transition !== null) {
      this.lastTransition = { kind: transition, lap: snapshot.currentLap };
      this.lastTransitionLap = snapshot.currentLap;
    }

    if (currentRainfall !== null) {
      this.previousRainfall = currentRainfall;
    }

    return this.activeTransition(snapshot.currentLap);
  }

  // 마지막 전환이 노출 창(windowLaps) 안이면 돌려준다. 랩을 모르면 계속 노출한다.
  private activeTransition(currentLap: number | null): WeatherTransition | null {
    if (this.lastTransition === null) {
      return null;
    }

    if (this.lastTransitionLap !== null && currentLap !== null) {
      if (currentLap - this.lastTransitionLap > this.windowLaps) {
        return null;
      }
    }

    return this.lastTransition;
  }
}
