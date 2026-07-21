import { DataMode, WatchNowDetectorConfig } from "@f1/domain";
import { publicAppEnvSchema, type PublicAppEnv } from "@f1/schemas";

// Next.js 는 NEXT_PUBLIC_* 를 정적으로 인라인하므로 명시적으로 참조한다.
const rawEnv = {
  NEXT_PUBLIC_DATA_MODE: process.env.NEXT_PUBLIC_DATA_MODE,
  NEXT_PUBLIC_USE_FIREBASE_EMULATOR:
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR,
  NEXT_PUBLIC_FIREBASE_EMULATOR_HOST:
    process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST,
  NEXT_PUBLIC_LIVE_SESSION_ID: process.env.NEXT_PUBLIC_LIVE_SESSION_ID,
  NEXT_PUBLIC_WATCH_NOW_TIRE_AGE_LAPS:
    process.env.NEXT_PUBLIC_WATCH_NOW_TIRE_AGE_LAPS,
  NEXT_PUBLIC_WATCH_NOW_GAP_SECONDS:
    process.env.NEXT_PUBLIC_WATCH_NOW_GAP_SECONDS,
  NEXT_PUBLIC_WATCH_NOW_GAP_SAMPLES:
    process.env.NEXT_PUBLIC_WATCH_NOW_GAP_SAMPLES,
  NEXT_PUBLIC_WATCH_NOW_GAP_REARM_MULTIPLIER:
    process.env.NEXT_PUBLIC_WATCH_NOW_GAP_REARM_MULTIPLIER,
  NEXT_PUBLIC_WATCH_NOW_UNDERCUT_POSITION_GAP:
    process.env.NEXT_PUBLIC_WATCH_NOW_UNDERCUT_POSITION_GAP,
  NEXT_PUBLIC_WATCH_NOW_POSITION_SWING:
    process.env.NEXT_PUBLIC_WATCH_NOW_POSITION_SWING,
  NEXT_PUBLIC_WATCH_NOW_SUPPRESS_GAP_DURING_SAFETY_CAR:
    process.env.NEXT_PUBLIC_WATCH_NOW_SUPPRESS_GAP_DURING_SAFETY_CAR,
};

let cached: PublicAppEnv | null = null;

export const getAppEnv = (): PublicAppEnv => {
  if (cached === null) {
    cached = publicAppEnvSchema.parse(rawEnv);
  }

  return cached;
};

export const getDataMode = (): DataMode => getAppEnv().NEXT_PUBLIC_DATA_MODE;

export const getLiveSessionId = (): string =>
  getAppEnv().NEXT_PUBLIC_LIVE_SESSION_ID;

// "지금 볼 것" 감지 임계값을 환경변수에서 읽어 도메인 설정 객체로 옮긴다.
//
// 미설정 값은 스키마가 도메인 기본값으로 채우므로 여기서 병합 분기를 두지 않는다 —
// 반환값은 항상 완전한 설정이다. `getAppEnv` 가 파싱 결과를 캐시하므로 호출 비용도 없고,
// 번들 인라인 값이라 런타임에 바뀌지 않는다(감지기 인스턴스를 다시 만들 이유가 없다).
export const getWatchNowDetectorConfig = (): WatchNowDetectorConfig => {
  const env = getAppEnv();

  return {
    tireAgeThresholdLaps: env.NEXT_PUBLIC_WATCH_NOW_TIRE_AGE_LAPS,
    gapThresholdSeconds: env.NEXT_PUBLIC_WATCH_NOW_GAP_SECONDS,
    gapConsecutiveSamples: env.NEXT_PUBLIC_WATCH_NOW_GAP_SAMPLES,
    gapRearmMultiplier: env.NEXT_PUBLIC_WATCH_NOW_GAP_REARM_MULTIPLIER,
    undercutPositionGap: env.NEXT_PUBLIC_WATCH_NOW_UNDERCUT_POSITION_GAP,
    positionSwingThreshold: env.NEXT_PUBLIC_WATCH_NOW_POSITION_SWING,
    suppressGapDuringSafetyCar:
      env.NEXT_PUBLIC_WATCH_NOW_SUPPRESS_GAP_DURING_SAFETY_CAR,
  };
};
