import {
  ClaudeProvider,
  CLAUDE_DEFAULT_MODEL,
} from "./ClaudeProvider";
import { FallbackLlmProvider, LlmFailureHandler } from "./FallbackLlmProvider";
import { GeminiProvider, GEMINI_DEFAULT_MODEL } from "./GeminiProvider";
import { MockLlmProvider } from "./MockLlmProvider";
import { OpenAiProvider, OPENAI_DEFAULT_MODEL } from "./OpenAiProvider";
import { RaceLlmProvider } from "./RaceLlmProvider";

// LLM provider 선택 로직 (docs/02-architecture.md §2.6 Provider Independence).
//
// 웹(Next.js 라우트)과 폴러 워커(Cloud Functions)가 같은 함수를 쓴다. 두 곳에 같은
// 우선순위를 복제하면 "웹에서는 Gemini, 워커에서는 mock" 같은 사고가 조용히 난다.
// 런타임마다 다른 것은 값을 어디서 읽는지뿐이라 그 부분만 reader 로 주입받는다
// (웹은 process.env, 워커는 Cloud Functions 시크릿).

// 환경값 읽기. 값이 없거나 비어 있으면 undefined 를 돌려줘야 한다.
export type LlmEnvReader = (name: string) => string | undefined;

// mock 으로 떨어졌을 때의 provider 이름. 호출측이 "실제 LLM 인지"를 판정한다.
export const MOCK_LLM_PROVIDER_NAME = "Mock";

export type SelectedLlmProvider = {
  // 로그·문서에 남길 provider 이름.
  name: string;
  // 실제로 호출될 모델 id. 해설 문서에 남겨 품질 회귀를 모델 단위로 추적한다.
  model: string;
  provider: RaceLlmProvider;
};

// 빈 문자열을 "설정됨" 으로 보지 않도록 정규화한다.
export const normalizeEnvValue = (
  value: string | undefined,
): string | undefined => {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  return value;
};

// process.env 기반 기본 reader. Node 런타임(웹 서버·로컬 하네스)이 쓴다.
export const createProcessEnvReader = (
  env: Record<string, string | undefined>,
): LlmEnvReader => {
  return (name: string): string | undefined => normalizeEnvValue(env[name]);
};

// 우선순위: Gemini → Claude → OpenAI. 키가 하나도 없으면 null 이다.
// Gemini 를 앞에 둔 이유는 무료 티어로 실제 LLM 경로를 검증하기 위함이다.
export const selectPrimaryLlmProvider = (
  readEnv: LlmEnvReader,
): SelectedLlmProvider | null => {
  const geminiKey = readEnv("GEMINI_API_KEY");

  if (geminiKey !== undefined) {
    const model = readEnv("GEMINI_MODEL");

    return {
      name: "Gemini",
      model: model ?? GEMINI_DEFAULT_MODEL,
      provider: new GeminiProvider({
        apiKey: geminiKey,
        model,
        baseUrl: readEnv("GEMINI_BASE_URL"),
      }),
    };
  }

  const anthropicKey = readEnv("ANTHROPIC_API_KEY");

  if (anthropicKey !== undefined) {
    const model = readEnv("ANTHROPIC_MODEL");

    return {
      name: "Claude",
      model: model ?? CLAUDE_DEFAULT_MODEL,
      provider: new ClaudeProvider({
        apiKey: anthropicKey,
        model,
        baseUrl: readEnv("ANTHROPIC_BASE_URL"),
      }),
    };
  }

  const openAiKey = readEnv("OPENAI_API_KEY");

  if (openAiKey !== undefined) {
    const model = readEnv("OPENAI_MODEL");

    return {
      name: "OpenAI",
      model: model ?? OPENAI_DEFAULT_MODEL,
      provider: new OpenAiProvider({
        apiKey: openAiKey,
        model,
        baseUrl: readEnv("OPENAI_BASE_URL"),
      }),
    };
  }

  return null;
};

// 실제 provider 를 고르되 실패(quota·네트워크 등) 시 결정론적 Mock 으로 폴백한다.
// LLM edge 의 실패가 AI 기능 전체를 중단시키지 않도록 하는 것이 목적이다.
//
// 폴백 결과는 isMock 이 true 로 표시되므로, 워커처럼 "mock 을 저장하면 안 되는" 호출자는
// 그 플래그로 걸러 낸다 (docs/18-ai-commentary-worker.md §폴백).
export const createRaceLlmProvider = (
  readEnv: LlmEnvReader,
  onFailure?: LlmFailureHandler,
): SelectedLlmProvider => {
  const primary = selectPrimaryLlmProvider(readEnv);

  if (primary === null) {
    return {
      name: MOCK_LLM_PROVIDER_NAME,
      model: MOCK_LLM_PROVIDER_NAME,
      provider: new MockLlmProvider(),
    };
  }

  return {
    name: primary.name,
    model: primary.model,
    provider: new FallbackLlmProvider(
      primary.provider,
      new MockLlmProvider(),
      onFailure,
    ),
  };
};
