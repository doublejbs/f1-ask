import { DataMode } from "@f1/domain";
import { publicAppEnvSchema, type PublicAppEnv } from "@f1/schemas";

// Next.js 는 NEXT_PUBLIC_* 를 정적으로 인라인하므로 명시적으로 참조한다.
const rawEnv = {
  NEXT_PUBLIC_DATA_MODE: process.env.NEXT_PUBLIC_DATA_MODE,
  NEXT_PUBLIC_USE_FIREBASE_EMULATOR:
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR,
  NEXT_PUBLIC_FIREBASE_EMULATOR_HOST:
    process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST,
  NEXT_PUBLIC_LIVE_SESSION_ID: process.env.NEXT_PUBLIC_LIVE_SESSION_ID,
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
