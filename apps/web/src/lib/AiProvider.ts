import {
  createProcessEnvReader,
  createRaceLlmProvider,
  RaceLlmProvider,
  SelectedLlmProvider,
} from "@f1/domain";

// 서버 전용 LLM provider 팩토리 (docs §2.6 Provider Independence).
//
// 우선순위 선택과 Mock 폴백은 @f1/domain 의 createRaceLlmProvider 가 갖고 있다.
// 폴러 워커(Cloud Functions)도 같은 함수를 쓰므로 "웹에서는 Gemini, 워커에서는 mock"
// 처럼 두 런타임이 갈리지 않는다 (docs/18-ai-commentary-worker.md).
// 여기 남는 것은 Next.js 런타임에 고유한 것뿐이다 — process.env 읽기와 모듈 캐시.
//
// API 키는 서버 환경변수로만 읽고 클라이언트 번들에 노출하지 않는다 (NEXT_PUBLIC_ 아님).
let cached: SelectedLlmProvider | null = null;

// 실패 시 서버 로그에만 남긴다 (키/민감 정보는 포함하지 않음).
const warnFallback = (error: unknown) => {
  console.warn(
    "LLM provider failed, falling back to mock:",
    error instanceof Error ? error.message : "unknown error",
  );
};

// 선택 결과(name·model)는 웹에서 쓰는 곳이 없다. provider 하나만 밖으로 낸다 —
// 워커는 도메인 팩토리를 직접 부르므로 여기서 SelectedLlmProvider 를 열어 둘 이유가 없다.
const getSelectedRaceLlmProvider = (): SelectedLlmProvider => {
  if (cached !== null) {
    return cached;
  }

  cached = createRaceLlmProvider(
    createProcessEnvReader(process.env),
    warnFallback,
  );

  return cached;
};

export const getRaceLlmProvider = (): RaceLlmProvider =>
  getSelectedRaceLlmProvider().provider;
