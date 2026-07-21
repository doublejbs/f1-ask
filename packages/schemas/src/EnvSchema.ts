import {
  DataMode,
  DEFAULT_GAP_CONSECUTIVE_SAMPLES,
  DEFAULT_GAP_REARM_MULTIPLIER,
  DEFAULT_GAP_THRESHOLD_SECONDS,
  DEFAULT_POSITION_SWING_THRESHOLD,
  DEFAULT_TIRE_AGE_THRESHOLD_LAPS,
  DEFAULT_UNDERCUT_POSITION_GAP,
} from "@f1/domain";
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

  // --- "지금 볼 것" 감지 임계값 (docs/19-watch-now.md §감지기와 임계값) ---
  //
  // **왜 환경변수인가**: 표의 발화 수가 실제로 어떤 체감인지는 레이스를 보면서만 알 수
  // 있어서 스펙이 "코드 수정 없이 조절 가능해야 한다" 고 요구한다. 도메인은 이미 전부
  // 주입 가능한데 앱에서 그 주입구에 닿을 경로가 없어, 랩수 하나를 바꾸려면 도메인 상수를
  // 편집해야 했다. 여기가 그 경로다.
  //
  // **NEXT_PUBLIC_ 접두사는 클라이언트 번들에 값이 인라인된다.** 임계값은 비밀이 아니라
  // 전부 docs/19 에 공개된 숫자이므로 노출돼도 잃을 것이 없다. 비밀은 절대 여기 두지 마라.
  //
  // 미설정이면 도메인 기본값(= 실측으로 정한 "채택" 열)이 그대로 쓰인다. 즉 이 블록은
  // 기본 동작을 바꾸지 않고 **덮어쓸 자리만** 연다.
  //
  // 빈 문자열은 통과시키지 않는다 — `z.coerce.number()` 가 `""` 를 0 으로 바꾸므로,
  // `.positive()` 가 없으면 오타 하나로 임계값이 조용히 0 이 되어 전 프레임이 발화한다.

  // A. 타이어 노후 발화 랩수.
  NEXT_PUBLIC_WATCH_NOW_TIRE_AGE_LAPS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_TIRE_AGE_THRESHOLD_LAPS),
  // B. 간격 수렴 임계(초).
  NEXT_PUBLIC_WATCH_NOW_GAP_SECONDS: z.coerce
    .number()
    .positive()
    .default(DEFAULT_GAP_THRESHOLD_SECONDS),
  // B. 위 조건이 유지되어야 하는 연속 관측 횟수.
  NEXT_PUBLIC_WATCH_NOW_GAP_SAMPLES: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_GAP_CONSECUTIVE_SAMPLES),
  // B. 재무장 배수 — 경계를 오가며 반복 발화하는 것을 막는다.
  NEXT_PUBLIC_WATCH_NOW_GAP_REARM_MULTIPLIER: z.coerce
    .number()
    .positive()
    .default(DEFAULT_GAP_REARM_MULTIPLIER),
  // C. 언더컷으로 볼 뒤차와의 순위 간격(계단).
  NEXT_PUBLIC_WATCH_NOW_UNDERCUT_POSITION_GAP: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_UNDERCUT_POSITION_GAP),
  // D. 순위 급변 발화 계단 수.
  NEXT_PUBLIC_WATCH_NOW_POSITION_SWING: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_POSITION_SWING_THRESHOLD),
  // SC · VSC 중 간격 기반 감지(B) 억제 여부.
  //
  // 끄는 스위치를 남기는 이유는 억제가 **가정**이기 때문이다 — SC 중 간격이 무의미하다는
  // 판단이 특정 서킷에서 틀릴 수 있고, 그때 확인할 방법이 코드 편집뿐이면 곤란하다.
  NEXT_PUBLIC_WATCH_NOW_SUPPRESS_GAP_DURING_SAFETY_CAR: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

export type PublicAppEnv = z.infer<typeof publicAppEnvSchema>;

// Firebase 초기화 시점에 호출한다. 실패 시 명확한 오류를 던진다.
export const parsePublicFirebaseEnv = (
  env: Record<string, string | undefined>,
): PublicFirebaseEnv => publicFirebaseEnvSchema.parse(env);
