import {
  LlmAnswer,
  LlmCommentary,
  LlmCommentaryRequest,
  LlmQuestionRequest,
  LlmSummary,
  LlmSummaryRequest,
  RaceLlmProvider,
} from "./RaceLlmProvider";

export type LlmFailureHandler = (error: unknown) => void;

// primary(예: OpenAI) 실패 시 fallback(예: Mock)으로 대체하는 provider.
// LLM(확률적 edge)의 실패가 AI 기능을 완전히 중단시키지 않도록 한다.
// (docs/02-architecture.md §3.1 Deterministic Core, Probabilistic Edge)
export class FallbackLlmProvider implements RaceLlmProvider {
  private readonly primary: RaceLlmProvider;
  private readonly fallback: RaceLlmProvider;
  private readonly onFailure?: LlmFailureHandler;

  constructor(
    primary: RaceLlmProvider,
    fallback: RaceLlmProvider,
    onFailure?: LlmFailureHandler,
  ) {
    this.primary = primary;
    this.fallback = fallback;
    this.onFailure = onFailure;
  }

  private async withFallback<T>(
    run: (provider: RaceLlmProvider) => Promise<T>,
  ): Promise<T> {
    try {
      return await run(this.primary);
    } catch (error) {
      this.onFailure?.(error);

      return run(this.fallback);
    }
  }

  answerQuestion(request: LlmQuestionRequest): Promise<LlmAnswer> {
    return this.withFallback((provider) => provider.answerQuestion(request));
  }

  generateCommentary(
    request: LlmCommentaryRequest,
  ): Promise<LlmCommentary> {
    return this.withFallback((provider) =>
      provider.generateCommentary(request),
    );
  }

  generateSummary(request: LlmSummaryRequest): Promise<LlmSummary> {
    return this.withFallback((provider) => provider.generateSummary(request));
  }
}
