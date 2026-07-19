import {
  ClaudeProvider,
  FallbackLlmProvider,
  MockLlmProvider,
  RaceLlmProvider,
} from "@f1/domain";

// 서버 전용 LLM provider 팩토리 (docs §2.6 Provider Independence).
// ANTHROPIC_API_KEY 가 설정돼 있으면 실제 Claude(Anthropic)를 쓰되, 실패(quota/네트워크 등)
// 시 결정론적 Mock 으로 fallback 한다 (LLM edge 실패가 AI 기능을 중단시키지 않도록).
// API 키는 서버 환경변수로만 읽고 클라이언트 번들에 노출하지 않는다 (NEXT_PUBLIC_ 아님).
let cached: RaceLlmProvider | null = null;

export const getRaceLlmProvider = (): RaceLlmProvider => {
  if (cached !== null) {
    return cached;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey !== undefined && apiKey.length > 0) {
    cached = new FallbackLlmProvider(
      new ClaudeProvider({ apiKey, model: process.env.ANTHROPIC_MODEL }),
      new MockLlmProvider(),
      (error) => {
        // 서버 로그에만 남긴다 (키/민감 정보는 포함하지 않음).
        console.warn(
          "Claude provider failed, falling back to mock:",
          error instanceof Error ? error.message : "unknown error",
        );
      },
    );
  } else {
    cached = new MockLlmProvider();
  }

  return cached;
};
