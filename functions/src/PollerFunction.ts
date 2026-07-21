import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  fetchLatestOpenF1Meta,
  MOCK_LLM_PROVIDER_NAME,
  OpenF1Auth,
  OpenF1ClientOptions,
  resolveSessionActivity,
  toCommentaryVariantKey,
} from "@f1/domain";
import {
  acquireWorkerLease,
  releaseWorkerLease,
} from "./FirestoreWorkerStore";
import { createWorkerLlmProvider } from "./FunctionLlmProvider";
import { runPollWindow } from "./PollRunner";
import {
  FUNCTION_REGION,
  FUNCTION_TIMEOUT_SECONDS,
  LIVE_SESSION_ID,
  resolveCommentaryVariants,
  SCHEDULE_CRON,
} from "./WorkerConfig";

// OpenF1 폴러 워커 (docs/16-poller-worker.md).
//
// Cloud Scheduler 가 1분마다 깨운다.
//   기동 → 세션 활성 확인 ├ 비활성 → 즉시 종료 (Firestore 쓰기 0)
//                        └ 활성   → 리스 취득 → 6초 간격 폴링 후 종료
//
// 자격증명: initializeApp() 만 호출해 런타임 ADC 를 쓴다. 서비스 계정 키 파일이 없다.

// OpenF1 계정은 비밀값이라 코드·레포에 넣지 않는다. Secret Manager 로 주입한다.
const openF1Username = defineSecret("OPENF1_USERNAME");
const openF1Password = defineSecret("OPENF1_PASSWORD");
// AI 해설용 LLM 키. 웹과 같은 이름을 쓴다 (docs/18-ai-commentary-worker.md).
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// 콜드 스타트마다 중복 초기화되지 않도록 모듈 스코프에서 한 번만 만든다.
const app = initializeApp();
const db = getFirestore(app);

// 스냅샷의 optional 필드(weather/lastSectorsSeconds 등)가 undefined 일 수 있어
// Firestore 쓰기 시 오류가 나지 않도록 undefined 프로퍼티를 무시한다.
db.settings({ ignoreUndefinedProperties: true });

export const pollOpenF1 = onSchedule(
  {
    schedule: SCHEDULE_CRON,
    region: FUNCTION_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT_SECONDS,
    secrets: [openF1Username, openF1Password, geminiApiKey],
    memory: "512MiB",
    // 인스턴스가 늘어나면 그만큼 중복 폴링이다. 리스와 함께 이중으로 막는다.
    maxInstances: 1,
    retryCount: 0,
  },
  async (event) => {
    const startedAtMs = Date.now();
    const deadlineMs = startedAtMs + FUNCTION_TIMEOUT_SECONDS * 1000;
    const clientOptions: OpenF1ClientOptions = {
      auth: new OpenF1Auth({
        username: openF1Username.value(),
        password: openF1Password.value(),
      }),
    };

    // 1) 활성 판정이 먼저다. 비활성이면 Firestore 를 한 번도 건드리지 않는다.
    const meta = await fetchLatestOpenF1Meta(clientOptions);
    const activity = resolveSessionActivity(meta, { nowMs: startedAtMs });

    if (!activity.isActive) {
      logger.info("세션이 비활성이라 폴링하지 않는다", {
        reason: activity.reason,
        sessionName: meta.sessionName,
        dateStart: meta.dateStart,
        dateEnd: meta.dateEnd,
      });

      return;
    }

    // 2) 리스로 중복 실행을 막는다.
    // 기동마다 유일해야 한다. event.jobName 은 스케줄러 잡 이름이라 매 기동 같은 값이고,
    // 그것을 소유자로 쓰면 겹친 두 인스턴스가 서로를 "자기 자신"으로 보고 둘 다 통과한다.
    const ownerId = `${event.scheduleTime ?? startedAtMs}-${randomUUID()}`;
    const hasLease = await acquireWorkerLease(
      db,
      LIVE_SESSION_ID,
      ownerId,
      startedAtMs,
    );

    if (!hasLease) {
      logger.info("다른 인스턴스가 리스를 들고 있어 종료한다", { ownerId });

      return;
    }

    // 3) 고정 sessionId 로 덮어써 클라이언트가 알려진 경로를 구독하게 한다.
    const liveMeta = { ...meta, sessionId: LIVE_SESSION_ID };

    // 4) 해설 생성기. mock 으로 떨어지면 저장 대상이 아니므로(docs/18 §폴백)
    // 실제 provider 가 잡혔을 때만 넘긴다 — 키가 없으면 폴링만 한다.
    const llm = createWorkerLlmProvider(geminiApiKey);
    const variants = resolveCommentaryVariants();
    const hasRealLlm = llm.name !== MOCK_LLM_PROVIDER_NAME;

    logger.info("폴링 시작", {
      sessionName: meta.sessionName,
      circuitName: meta.circuitName,
      sessionKey: meta.sessionKey,
      target: LIVE_SESSION_ID,
      // 키 값이 아니라 이름·모델만 남긴다.
      llmProvider: llm.name,
      llmModel: llm.model,
      commentaryVariants: variants.map(toCommentaryVariantKey),
    });

    try {
      const result = await runPollWindow({
        db,
        sessionId: LIVE_SESSION_ID,
        meta: liveMeta,
        clientOptions,
        startedAtMs,
        deadlineMs,
        llm: hasRealLlm ? llm : undefined,
        variants,
      });

      logger.info("폴링 창 종료", {
        ...result,
        elapsedMs: Date.now() - startedAtMs,
      });
    } finally {
      // 리스 TTL 은 최대 실행 시간(100초)에 맞춰져 스케줄 간격보다 길다. 짧게 끝난 기동이
      // 자연 만료를 기다리면 다음 기동까지 막히므로 여기서 명시적으로 푼다.
      // 해제 실패가 이 기동의 결과를 되돌릴 이유는 없다 — TTL 이 뒤를 받쳐 준다.
      try {
        await releaseWorkerLease(db, LIVE_SESSION_ID, ownerId);
      } catch (error) {
        logger.warn("리스 해제에 실패했다. TTL 만료를 기다린다", {
          message: error instanceof Error ? error.message : "unknown error",
        });
      }
    }
  },
);
