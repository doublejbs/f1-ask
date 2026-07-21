import {
  ClaudeProvider,
  FallbackLlmProvider,
  GeminiProvider,
  MockLlmProvider,
  OpenAiProvider,
  RaceLlmProvider,
} from "@f1/domain";

// 서버 전용 LLM provider 팩토리 (docs §2.6 Provider Independence).
// 사용 가능한 API 키를 우선순위대로 골라 실제 provider 를 쓰되, 실패(quota/네트워크 등)
// 시 결정론적 Mock 으로 fallback 한다 (LLM edge 실패가 AI 기능을 중단시키지 않도록).
// API 키는 서버 환경변수로만 읽고 클라이언트 번들에 노출하지 않는다 (NEXT_PUBLIC_ 아님).
let cached: RaceLlmProvider | null = null;

// 값이 비어 있으면 undefined 로 정규화한다 (빈 문자열 키를 "설정됨" 으로 보지 않도록).
const readEnv = (name: string): string | undefined => {
  const value = process.env[name];

  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  return value;
};

// 실패 시 서버 로그에만 남긴다 (키/민감 정보는 포함하지 않음).
const warnFallback = (providerName: string) => (error: unknown) => {
  console.warn(
    `${providerName} provider failed, falling back to mock:`,
    error instanceof Error ? error.message : "unknown error",
  );
};

// 우선순위: Gemini → Claude → OpenAI → Mock.
// Gemini 를 앞에 둔 이유는 무료 티어로 실제 LLM 경로를 검증하기 위함이다.
const createPrimaryProvider = (): {
  name: string;
  provider: RaceLlmProvider;
} | null => {
  const geminiKey = readEnv("GEMINI_API_KEY");

  if (geminiKey !== undefined) {
    return {
      name: "Gemini",
      provider: new GeminiProvider({
        apiKey: geminiKey,
        model: readEnv("GEMINI_MODEL"),
        baseUrl: readEnv("GEMINI_BASE_URL"),
      }),
    };
  }

  const anthropicKey = readEnv("ANTHROPIC_API_KEY");

  if (anthropicKey !== undefined) {
    return {
      name: "Claude",
      provider: new ClaudeProvider({
        apiKey: anthropicKey,
        model: readEnv("ANTHROPIC_MODEL"),
        baseUrl: readEnv("ANTHROPIC_BASE_URL"),
      }),
    };
  }

  const openAiKey = readEnv("OPENAI_API_KEY");

  if (openAiKey !== undefined) {
    return {
      name: "OpenAI",
      provider: new OpenAiProvider({
        apiKey: openAiKey,
        model: readEnv("OPENAI_MODEL"),
        baseUrl: readEnv("OPENAI_BASE_URL"),
      }),
    };
  }

  return null;
};

export const getRaceLlmProvider = (): RaceLlmProvider => {
  if (cached !== null) {
    return cached;
  }

  const primary = createPrimaryProvider();

  if (primary === null) {
    cached = new MockLlmProvider();

    return cached;
  }

  cached = new FallbackLlmProvider(
    primary.provider,
    new MockLlmProvider(),
    warnFallback(primary.name),
  );

  return cached;
};
