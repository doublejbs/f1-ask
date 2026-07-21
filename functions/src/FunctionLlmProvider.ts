import { logger } from "firebase-functions";
import {
  createRaceLlmProvider,
  LlmEnvReader,
  normalizeEnvValue,
  SelectedLlmProvider,
} from "@f1/domain";

// 함수 런타임의 LLM provider (docs/18-ai-commentary-worker.md).
//
// apps/web 의 팩토리는 Next.js 앱 코드라 functions 에서 import 할 수 없다
// (esbuild 가 @f1/domain 만 인라인한다). 그래서 선택 로직은 도메인의
// createRaceLlmProvider 에 두고, 여기서는 값을 어디서 읽는지만 바꾼다.
// 웹과 로직이 갈라지지 않는 것이 핵심이다.

// API 키만 Secret Manager 로 주입한다. 모델·baseUrl 은 비밀이 아니라 일반 환경변수다.
// 시크릿 이름은 웹의 환경변수와 같은 GEMINI_API_KEY 를 쓴다.
//
// 이름 → 시크릿을 **1:1 로** 매핑한다. 이름 집합으로만 판정하면 두 번째 시크릿을
// 추가하는 순간 그 이름에도 Gemini 키가 돌아간다.
const GEMINI_API_KEY_ENV = "GEMINI_API_KEY";

// defineSecret 이 돌려주는 값에서 이 워커가 쓰는 것은 value() 하나뿐이다.
// 구조적 타입으로 받아 firebase-functions 내부 경로에 의존하지 않는다.
export type SecretValueSource = {
  value: () => string;
};

// 시크릿이 배포에 바인딩되지 않았으면 value() 가 던질 수 있다.
// 키가 없는 것은 "해설을 만들지 않는다" 로 흡수해야지 폴링을 죽이면 안 된다.
const readSecret = (secret: SecretValueSource): string | undefined => {
  try {
    return normalizeEnvValue(secret.value());
  } catch {
    return undefined;
  }
};

// 시크릿 이름은 도메인 팩토리가 요구하는 이름 그대로 받아 넘긴다.
export const createFunctionEnvReader = (
  geminiApiKey: SecretValueSource,
): LlmEnvReader => {
  const secrets = new Map<string, SecretValueSource>([
    [GEMINI_API_KEY_ENV, geminiApiKey],
  ]);

  return (name: string): string | undefined => {
    const secret = secrets.get(name);

    if (secret !== undefined) {
      return readSecret(secret);
    }

    return normalizeEnvValue(process.env[name]);
  };
};

// 실패는 이름만 남긴다. 키 값은 절대 로그에 넣지 않는다.
const warnFallback = (error: unknown): void => {
  logger.warn("LLM 호출이 실패해 mock 으로 폴백했다", {
    message: error instanceof Error ? error.message : "unknown error",
  });
};

export const createWorkerLlmProvider = (
  geminiApiKey: SecretValueSource,
): SelectedLlmProvider =>
  createRaceLlmProvider(createFunctionEnvReader(geminiApiKey), warnFallback);
