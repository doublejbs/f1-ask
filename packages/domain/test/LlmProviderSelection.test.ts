import { describe, expect, it } from "vitest";
import { ClaudeProvider } from "../src/ai/ClaudeProvider";
import { GeminiProvider, GEMINI_DEFAULT_MODEL } from "../src/ai/GeminiProvider";
import {
  createProcessEnvReader,
  createRaceLlmProvider,
  MOCK_LLM_PROVIDER_NAME,
  selectPrimaryLlmProvider,
} from "../src/ai/LlmProviderSelection";
import { MockLlmProvider } from "../src/ai/MockLlmProvider";
import { OpenAiProvider } from "../src/ai/OpenAiProvider";

// provider 선택 로직 (docs/02-architecture.md §2.6).
// 웹 라우트와 폴러 워커가 같은 함수를 쓴다 — 두 런타임이 서로 다른 provider 를 고르면
// "웹에서는 Gemini, 워커에서는 mock" 같은 사고가 조용히 난다.

const readerOf = (env: Record<string, string | undefined>) =>
  createProcessEnvReader(env);

describe("selectPrimaryLlmProvider", () => {
  it("키가 하나도 없으면 null 이다", () => {
    expect(selectPrimaryLlmProvider(readerOf({}))).toBeNull();
  });

  it("빈 문자열 키는 설정된 것으로 보지 않는다", () => {
    expect(
      selectPrimaryLlmProvider(readerOf({ GEMINI_API_KEY: "   " })),
    ).toBeNull();
  });

  it("우선순위는 Gemini → Claude → OpenAI 다", () => {
    const all = selectPrimaryLlmProvider(
      readerOf({
        GEMINI_API_KEY: "g",
        ANTHROPIC_API_KEY: "a",
        OPENAI_API_KEY: "o",
      }),
    );

    expect(all?.name).toBe("Gemini");
    expect(all?.provider).toBeInstanceOf(GeminiProvider);

    const withoutGemini = selectPrimaryLlmProvider(
      readerOf({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" }),
    );

    expect(withoutGemini?.name).toBe("Claude");
    expect(withoutGemini?.provider).toBeInstanceOf(ClaudeProvider);

    const openAiOnly = selectPrimaryLlmProvider(
      readerOf({ OPENAI_API_KEY: "o" }),
    );

    expect(openAiOnly?.name).toBe("OpenAI");
    expect(openAiOnly?.provider).toBeInstanceOf(OpenAiProvider);
  });

  it("모델을 지정하지 않으면 provider 기본 모델을 보고한다", () => {
    const selected = selectPrimaryLlmProvider(
      readerOf({ GEMINI_API_KEY: "g" }),
    );

    expect(selected?.model).toBe(GEMINI_DEFAULT_MODEL);
  });

  it("모델을 지정하면 그 값을 보고한다 (해설 문서에 남는 값이다)", () => {
    const selected = selectPrimaryLlmProvider(
      readerOf({ GEMINI_API_KEY: "g", GEMINI_MODEL: "gemini-x" }),
    );

    expect(selected?.model).toBe("gemini-x");
  });
});

describe("createRaceLlmProvider", () => {
  it("키가 없으면 Mock 이고 이름으로 그것을 알 수 있다", () => {
    const selected = createRaceLlmProvider(readerOf({}));

    expect(selected.name).toBe(MOCK_LLM_PROVIDER_NAME);
    expect(selected.provider).toBeInstanceOf(MockLlmProvider);
  });

  it("키가 있으면 이름이 실제 provider 다 (워커가 이 이름으로 해설 여부를 가른다)", () => {
    const selected = createRaceLlmProvider(readerOf({ GEMINI_API_KEY: "g" }));

    expect(selected.name).toBe("Gemini");
    expect(selected.name).not.toBe(MOCK_LLM_PROVIDER_NAME);
  });
});
