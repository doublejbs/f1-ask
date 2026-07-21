import { describe, expect, it } from "vitest";
import {
  LLM_REQUEST_TIMEOUT_MS,
  LLM_TIMEOUT_ERROR_PREFIX,
  withLlmRequestTimeout,
} from "../src/ai/LlmRequestTimeout";
import { ClaudeProvider } from "../src/ai/ClaudeProvider";
import { GeminiProvider } from "../src/ai/GeminiProvider";
import { OpenAiProvider } from "../src/ai/OpenAiProvider";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import { SupportedLocale } from "../src/SupportedLocale";

// LLM 호출 타임아웃 (docs/18-ai-commentary-worker.md §폴백).
//
// 워커의 해설 예산은 "호출 하나가 12초 안에 끝난다"를 전제로 계산된다. 전제를 강제하지
// 않으면 호출 하나가 함수 타임아웃을 먹고 커서·러닝 컨텍스트 쓰기까지 함께 날아간다.

const TEST_TIMEOUT_MS = 20;

const snapshot = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
).snapshotAt(70).snapshot;

const EVENT = {
  schemaVersion: 1 as const,
  id: "event:a",
  sessionId: "session:test",
  type: RaceEventType.Penalty,
  priority: RaceEventPriority.High,
  lapNumber: 41,
  timestamp: "2026-07-19T05:00:00.000Z",
  params: {},
  deduplicationKey: "event:a",
};

// 영원히 응답하지 않는 fetch. signal 도 무시한다 —
// 주입 구현이 signal 을 지키지 않아도 호출자는 예산 안에 돌아와야 한다.
const hangingFetch = async (): Promise<never> =>
  new Promise<never>(() => undefined);

describe("withLlmRequestTimeout", () => {
  it("상한을 넘기면 거절한다", async () => {
    await expect(
      withLlmRequestTimeout(hangingFetch, {
        timeoutMs: TEST_TIMEOUT_MS,
        label: "Test",
      }),
    ).rejects.toThrow(LLM_TIMEOUT_ERROR_PREFIX);
  });

  it("상한을 넘기면 signal 을 끊는다", async () => {
    let observed: AbortSignal | null = null;

    await expect(
      withLlmRequestTimeout(
        (signal) => {
          observed = signal;

          return hangingFetch();
        },
        { timeoutMs: TEST_TIMEOUT_MS, label: "Test" },
      ),
    ).rejects.toThrow(LLM_TIMEOUT_ERROR_PREFIX);

    expect(observed).not.toBeNull();
    expect((observed as unknown as AbortSignal).aborted).toBe(true);
  });

  it("상한 안에 끝나면 결과를 그대로 돌려준다", async () => {
    const result = await withLlmRequestTimeout(async () => "ok", {
      timeoutMs: TEST_TIMEOUT_MS,
      label: "Test",
    });

    expect(result).toBe("ok");
  });

  it("오류 메시지에 키가 들어가지 않는다", async () => {
    await expect(
      withLlmRequestTimeout(hangingFetch, {
        timeoutMs: TEST_TIMEOUT_MS,
        label: "Gemini (model: gemini-3.5-flash)",
      }),
    ).rejects.toThrow(/gemini-3\.5-flash/);
  });
});

describe("provider 요청 타임아웃", () => {
  const commentaryRequest = {
    event: EVENT,
    locale: SupportedLocale.Ko,
    explanationLevel: ExplanationLevel.Standard,
    snapshot,
  };

  // 세 provider 모두에 걸려야 한다. 한 곳만 고치면 provider 를 바꿨을 때 다시 깨진다.
  it("Gemini 가 응답하지 않으면 상한에서 끊는다", async () => {
    const provider = new GeminiProvider({
      apiKey: "test-key",
      fetchImpl: hangingFetch,
      timeoutMs: TEST_TIMEOUT_MS,
    });

    await expect(provider.generateCommentary(commentaryRequest)).rejects.toThrow(
      LLM_TIMEOUT_ERROR_PREFIX,
    );
  });

  it("Claude 가 응답하지 않으면 상한에서 끊는다", async () => {
    const provider = new ClaudeProvider({
      apiKey: "test-key",
      fetchImpl: hangingFetch,
      timeoutMs: TEST_TIMEOUT_MS,
    });

    await expect(provider.generateCommentary(commentaryRequest)).rejects.toThrow(
      LLM_TIMEOUT_ERROR_PREFIX,
    );
  });

  it("OpenAI 가 응답하지 않으면 상한에서 끊는다", async () => {
    const provider = new OpenAiProvider({
      apiKey: "test-key",
      fetchImpl: hangingFetch,
      timeoutMs: TEST_TIMEOUT_MS,
    });

    await expect(provider.generateCommentary(commentaryRequest)).rejects.toThrow(
      LLM_TIMEOUT_ERROR_PREFIX,
    );
  });

  it("Q&A · 요약 경로에도 같은 상한이 걸린다", async () => {
    // 전송 계층 한 곳에 걸어 세 요청 종류가 모두 덮인다.
    const provider = new GeminiProvider({
      apiKey: "test-key",
      fetchImpl: hangingFetch,
      timeoutMs: TEST_TIMEOUT_MS,
    });

    await expect(
      provider.answerQuestion({
        question: "지금 누가 선두야?",
        locale: SupportedLocale.Ko,
        explanationLevel: ExplanationLevel.Standard,
        snapshot,
        recentEvents: [],
        favoriteDriverNumbers: [],
      }),
    ).rejects.toThrow(LLM_TIMEOUT_ERROR_PREFIX);
  });

  it("기본 상한은 워커의 해설 호출 예산과 같은 상수다", () => {
    // functions/src/WorkerConfig.ts 의 COMMENTARY_CALL_BUDGET_MS 가 이 값을 그대로 쓴다.
    expect(LLM_REQUEST_TIMEOUT_MS).toBe(12_000);
  });
});
