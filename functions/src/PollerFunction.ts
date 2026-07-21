import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  fetchLatestOpenF1Meta,
  OpenF1Auth,
  OpenF1ClientOptions,
  resolveSessionActivity,
} from "@f1/domain";
import { acquireWorkerLease } from "./FirestoreWorkerStore";
import { runPollWindow } from "./PollRunner";
import {
  FUNCTION_REGION,
  FUNCTION_TIMEOUT_SECONDS,
  LIVE_SESSION_ID,
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
    secrets: [openF1Username, openF1Password],
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

    logger.info("폴링 시작", {
      sessionName: meta.sessionName,
      circuitName: meta.circuitName,
      sessionKey: meta.sessionKey,
      target: LIVE_SESSION_ID,
    });

    const result = await runPollWindow({
      db,
      sessionId: LIVE_SESSION_ID,
      meta: liveMeta,
      clientOptions,
      deadlineMs,
    });

    logger.info("폴링 창 종료", {
      ...result,
      elapsedMs: Date.now() - startedAtMs,
    });
  },
);
