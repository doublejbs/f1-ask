import { DataMode } from "@f1/domain";
import { z } from "zod";

// 공개 Firebase 설정도 시작 시 검증한다 (docs/03-firestore-and-auth.md §4.3).
// 설정 누락 시 빈 문자열로 초기화하지 않고 명확한 오류를 발생시킨다.
export const publicFirebaseEnvSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
});

export type PublicFirebaseEnv = z.infer<typeof publicFirebaseEnvSchema>;

// 앱 런타임 설정. Mock 모드에서는 Firebase 설정이 없어도 동작해야 하므로
// Firebase 값은 optional 로 두고 실제 초기화 시점에만 엄격히 검증한다.
export const publicAppEnvSchema = z.object({
  NEXT_PUBLIC_DATA_MODE: z.nativeEnum(DataMode).default(DataMode.Mock),
  NEXT_PUBLIC_USE_FIREBASE_EMULATOR: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  // Emulator 호스트. 다른 기기에서 접속 시 이 머신의 LAN IP 로 설정한다
  // (클라이언트가 127.0.0.1 로 붙으면 기기 자신의 localhost 를 가리키기 때문).
  NEXT_PUBLIC_FIREBASE_EMULATOR_HOST: z.string().min(1).default("127.0.0.1"),
  // Live 모드에서 구독할 세션 ID (Firestore sessions/{id}).
  NEXT_PUBLIC_LIVE_SESSION_ID: z.string().min(1).default("2023-singapore-race"),
});

export type PublicAppEnv = z.infer<typeof publicAppEnvSchema>;

// Firebase 초기화 시점에 호출한다. 실패 시 명확한 오류를 던진다.
export const parsePublicFirebaseEnv = (
  env: Record<string, string | undefined>,
): PublicFirebaseEnv => publicFirebaseEnvSchema.parse(env);
