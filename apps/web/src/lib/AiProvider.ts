import {
  createProcessEnvReader,
  createRaceLlmProvider,
  LOOKUP_F1_KNOWLEDGE_TOOL_NAME,
  LlmQuestionRequest,
  QUERY_DRIVER_EVENTS_TOOL_NAME,
  QuestionToolExecutorFactory,
  RaceEvent,
  RaceLlmProvider,
  SelectedLlmProvider,
  createDriverEventsExecutor,
  createKnowledgeExecutor,
} from "@f1/domain";
import { hasServerFirestoreCredentials } from "@/firebase/ServerFirestore";
import { fetchSessionEvents } from "./SessionEventFetcher";

// 서버 전용 LLM provider 팩토리 (docs §2.6 Provider Independence, docs/26 2단계).
//
// 우선순위 선택과 Mock 폴백은 @f1/domain 의 createRaceLlmProvider 가 갖고 있다.
// 폴러 워커(Cloud Functions)도 같은 함수를 쓰므로 "웹에서는 Gemini, 워커에서는 mock"
// 처럼 두 런타임이 갈리지 않는다 (docs/18-ai-commentary-worker.md).
// 여기 남는 것은 Next.js 런타임에 고유한 것뿐이다 — process.env 읽기와 모듈 캐시,
// 그리고 서버 Firestore 기반 툴 executor 팩토리 조립.
//
// API 키·서비스 계정은 서버 환경변수로만 읽고 클라이언트 번들에 노출하지 않는다 (NEXT_PUBLIC_ 아님).
let cached: SelectedLlmProvider | null = null;

// 실패 시 서버 로그에만 남긴다 (키/민감 정보는 포함하지 않음).
const warnFallback = (error: unknown) => {
  console.warn(
    "LLM provider failed, falling back to mock:",
    error instanceof Error ? error.message : "unknown error",
  );
};

// 요청 스코프 툴 executor 팩토리. provider 는 캐시되지만 executor 는 요청마다 그 요청의
// sessionId 로 만들어져야 한다 (docs/26 §서버측 Firestore).
//
// **lazy·memoize**: Firestore 읽기는 첫 툴 호출 때만 일어난다. 라우터가 "이미 실린 데이터로
// 답된다"고 판단해 툴을 안 쓰면(단순 질문 대다수) 이 요청의 Firestore 읽기는 0 이다.
// 단일 요청 내에서 여러 도구 호출이 병렬로 실행될 때(Gemini runToolLoop 가 Promise.all 로
// 병렬화), Promise 를 캐시하면 첫 fetch 가 끝나기를 기다려 한 번만 읽는다. 해소된 값이 아니라
// Promise 를 캐시함으로써 경쟁 조건을 피한다 (rejected Promise 가 캐시되면 이 요청 내 재시도
// 불가인데, Firestore 장애 시 매 라운드 전체 읽기 재시도를 막으므로 오히려 낫다).
//
// **sessionId 신뢰 경계**: sessionId 는 클라이언트가 보낸 스냅샷에서 온다(라우트에 이미
// authoritative-read TODO 있음). events 는 공개 읽기 자원이라 저위험이나, 클라이언트가 임의
// sessionId 를 넣을 수 있음을 인지한다 (docs/26 §sessionId 신뢰 경계).
//
// **eventsEnabled 로 이벤트 툴만 끈다.** 예전에는 Firestore 자격이 없으면 팩토리 자체를
// 넘기지 않아 정적 지식 툴까지 함께 사라졌다 — 지식은 Firestore 와 무관한데 조립이 둘을
// 묶어 버린 것이다. 자격이 없어도 지식 툴은 그대로 열고, queryDriverEvents 만 빈 결과로
// 응답한다(모델은 "그 정보는 없다"로 답할 수 있다).
//
// TODO(리뷰 권고 2): 이 이름 분기는 도메인의 createQuestionToolExecutor 와 모양이 겹친다.
// 합치려면 도메인 팩토리가 "이벤트 배열" 대신 "이벤트를 주는 lazy 공급자"를 받도록 시그니처를
// 바꿔야 하는데(그 lazy·memoize 가 이 파일의 존재 이유다) 워커·테스트 호출부까지 함께
// 손대야 해 이번 수정 범위를 넘는다. 지금은 의도적으로 중복을 남긴다.
const createServerToolExecutorFactory = (
  eventsEnabled: boolean,
): QuestionToolExecutorFactory => {
  return (request: LlmQuestionRequest) => {
    const sessionId = request.snapshot.sessionId;
    // 지식은 정적 도메인 데이터라 Firestore 를 타지 않는다 (docs/26 §C). 서킷 항목은
    // 이 세션의 circuitName 으로 고정한다 — 모델이 서킷을 고르지 않는다.
    const knowledgeExecutor = createKnowledgeExecutor(
      request.snapshot.circuitName,
    );
    let eventsPromise: Promise<RaceEvent[]> | null = null;

    return async (name, args) => {
      // 지식 툴만 쓴 질문은 Firestore 읽기 0 이다 — lazy fetch 를 건드리지 않는다.
      if (name === LOOKUP_F1_KNOWLEDGE_TOOL_NAME) {
        return knowledgeExecutor(name, args);
      }

      // 아는 툴 이름일 때만 Firestore 를 읽는다. 모델의 오타·환각 툴 이름이 세션 이벤트
      // 전체 읽기를 유발하면 비용·지연이 모델 실수에 좌우된다.
      if (name !== QUERY_DRIVER_EVENTS_TOOL_NAME) {
        return [];
      }

      // 서비스 계정 자격이 없는 환경(로컬·미설정)에서는 이벤트 조회만 비활성이다.
      if (!eventsEnabled) {
        return [];
      }

      if (eventsPromise === null) {
        eventsPromise = fetchSessionEvents(sessionId);
      }

      // Firestore 또는 executor 에러를 모델에 노출하지 않는다. 원본 오류는 서버 로그에만
      // 남기고 고정 문구로 응답한다 (프로젝트 ID·자격 정보 유출 방지).
      //
      // **fetch 도 try 안이다.** 예전에는 await 가 밖에 있어 Firestore 자격·권한 오류가
      // 마스킹을 건너뛰고 그대로 올라갔다 — 유출을 막으려 만든 경계가 정작 유출 가능성이
      // 가장 큰 호출을 덮지 못했다.
      try {
        const events = await eventsPromise;
        const executor = createDriverEventsExecutor(events);

        return await executor(name, args);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "unknown error";
        console.warn(`[AiProvider] executor error for tool '${name}':`, errorMessage);

        return {
          error: "Failed to fetch event history",
        };
      }
    };
  };
};

// 선택 결과(name·model)는 웹에서 쓰는 곳이 없다. provider 하나만 밖으로 낸다 —
// 워커는 도메인 팩토리를 직접 부르므로 여기서 SelectedLlmProvider 를 열어 둘 이유가 없다.
const getSelectedRaceLlmProvider = (): SelectedLlmProvider => {
  if (cached !== null) {
    return cached;
  }

  // 툴은 항상 연다 — 지식 툴은 정적 도메인 데이터라 Firestore 자격과 무관하다.
  // 자격 유무는 이벤트 조회 하나만 켜고 끈다.
  const toolExecutorFactory = createServerToolExecutorFactory(
    hasServerFirestoreCredentials(),
  );

  cached = createRaceLlmProvider(
    createProcessEnvReader(process.env),
    warnFallback,
    { toolExecutorFactory },
  );

  return cached;
};

export const getRaceLlmProvider = (): RaceLlmProvider =>
  getSelectedRaceLlmProvider().provider;
