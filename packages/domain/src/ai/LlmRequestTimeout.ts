// LLM 호출 1회의 상한 시간 (docs/18-ai-commentary-worker.md §폴백).
//
// 워커의 해설 예산은 "호출 하나가 최악이라도 이 시간 안에 끝난다"를 전제로 남은 시간을
// 나눈다. 전제를 강제하지 않으면 호출 하나가 함수 타임아웃(120초)을 통째로 먹고,
// 강제 종료 탓에 finally 의 이벤트 커서 · 러닝 컨텍스트 쓰기까지 함께 날아간다
// (docs/16-poller-worker.md 에서 쓰기가 200배 났던 상황이 그대로 재현된다).
//
// 그래서 이 상수가 예산과 타임아웃의 **유일한 출처**다.
// functions/src/WorkerConfig.ts 의 COMMENTARY_CALL_BUDGET_MS 가 이 값을 그대로 쓰고,
// 세 provider(Gemini · Claude · OpenAI)의 기본 요청 타임아웃도 이 값이다.
// 두 상수를 따로 두면 다음 사람이 한쪽만 고쳐 예산이 다시 가정으로 돌아간다.
export const LLM_REQUEST_TIMEOUT_MS = 12_000;

// 타임아웃으로 끊긴 호출을 로그에서 다른 실패와 구분하기 위한 고정 접두사.
export const LLM_TIMEOUT_ERROR_PREFIX = "LLM request timed out";

export type LlmRequestTimeoutOptions = {
  timeoutMs: number;
  // 오류 메시지에 남길 식별자. API 키 · 전체 URL 은 절대 넣지 않는다.
  label: string;
};

// LLM 요청 하나를 상한 시간 안으로 묶는다.
//
// AbortSignal 을 넘겨 실제 소켓을 끊되, 거기에만 기대지 않고 타이머로 한 번 더 감싼다.
// fetch 는 주입 가능하고(테스트 · 어댑터) 주입된 구현이 signal 을 무시할 수 있는데,
// 그때도 호출자는 예산 안에 반드시 돌아와야 하기 때문이다.
export const withLlmRequestTimeout = async <T>(
  run: (signal: AbortSignal) => Promise<T>,
  options: LlmRequestTimeoutOptions,
): Promise<T> => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new Error(
          `${LLM_TIMEOUT_ERROR_PREFIX}: ${options.label} (${options.timeoutMs}ms)`,
        ),
      );
    }, options.timeoutMs);
  });

  try {
    return await Promise.race([run(controller.signal), expiry]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};
