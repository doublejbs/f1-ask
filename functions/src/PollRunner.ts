import { Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import {
  buildOpenF1LiveFrame,
  decidePublish,
  EMPTY_PUBLISH_STATE,
  EventWriteCursor,
  fetchOpenF1SessionData,
  OpenF1ClientOptions,
  OpenF1SessionData,
  OpenF1SessionMeta,
  PublishState,
  selectUnwrittenEvents,
} from "@f1/domain";
import {
  readEventWriteCursor,
  writeEvents,
  writeEventWriteCursor,
  writeLiveSnapshot,
  writeSessionDoc,
} from "./FirestoreWorkerStore";
import {
  POLL_DEADLINE_MARGIN_MS,
  POLL_INTERVAL_MS,
  POLL_ITERATIONS,
} from "./WorkerConfig";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// 랩 시각이 하나도 없을 때 쓰는 fallback 세션 길이 (로컬 하네스와 같은 값).
const FALLBACK_SESSION_MS = 3_600_000;

// 랩 date_start 최솟값을 세션 시작으로 본다 (로컬 하네스와 동일한 계산).
// 아직 랩이 없으면 nowMs 로 잡지 말고 한 시간 뒤로 물린다 — 창을 [now, now] 로
// 좁히면 포메이션 랩 전의 race_control 메시지가 통째로 버려진다.
const resolveStartMs = (data: OpenF1SessionData, nowMs: number): number => {
  const lapStarts = data.laps
    .map((lap) => (lap.date_start === null ? Number.NaN : Date.parse(lap.date_start)))
    .filter((ms) => !Number.isNaN(ms));

  return lapStarts.length > 0
    ? Math.min(...lapStarts)
    : nowMs - FALLBACK_SESSION_MS;
};

export type PollRunOptions = {
  db: Firestore;
  sessionId: string;
  meta: OpenF1SessionMeta;
  clientOptions: OpenF1ClientOptions;
  // 이 시각을 넘겨 폴링을 시작하지 않는다 (함수 타임아웃 보호).
  deadlineMs: number;
};

export type PollRunResult = {
  polls: number;
  eventWrites: number;
  snapshotWrites: number;
  sessionDocWrites: number;
};

// 한 번의 함수 기동이 담당하는 폴링 창.
//
// 이벤트 커서는 기동 시작에 한 번 읽고 끝에 한 번 쓴다. 폴링마다 저장하면
// 커서 문서 자체가 쓰기 폭증이 된다 (docs/16-poller-worker.md).
export const runPollWindow = async (
  options: PollRunOptions,
): Promise<PollRunResult> => {
  const { db, sessionId, meta, clientOptions } = options;

  let cursor: EventWriteCursor = await readEventWriteCursor(db, sessionId);
  let publishState: PublishState = EMPTY_PUBLISH_STATE;
  const result: PollRunResult = {
    polls: 0,
    eventWrites: 0,
    snapshotWrites: 0,
    sessionDocWrites: 0,
  };
  let hasCursorChanged = false;

  try {
    for (let iteration = 0; iteration < POLL_ITERATIONS; iteration += 1) {
      if (Date.now() + POLL_DEADLINE_MARGIN_MS > options.deadlineMs) {
        logger.info("폴링 창 마감이 임박해 조기 종료한다", {
          iteration,
        });

        break;
      }

      const data = await fetchOpenF1SessionData(meta, clientOptions);
      const nowMs = Date.now();
      const startMs = resolveStartMs(data, nowMs);
      const { snapshot, events } = buildOpenF1LiveFrame(data, {
        startMs,
        nowMs,
        version: iteration,
      });
      const iso = new Date().toISOString();
      const liveSnapshot = {
        ...snapshot,
        sessionId,
        sourceUpdatedAt: iso,
        generatedAt: iso,
      };
      const decision = decidePublish(liveSnapshot, publishState, { nowMs });

      publishState = decision.nextState;

      if (decision.shouldWriteSnapshot) {
        await writeLiveSnapshot(db, sessionId, liveSnapshot);
        result.snapshotWrites += 1;
      }

      if (decision.shouldWriteSessionDoc) {
        await writeSessionDoc(db, sessionId, liveSnapshot);
        result.sessionDocWrites += 1;
      }

      // 핵심: 매 폴링은 "지금까지의 전체 이벤트"를 다시 계산한다.
      // 커서로 아직 쓰지 않은 것만 걸러 낸다.
      const selection = selectUnwrittenEvents(events, cursor);

      if (selection.events.length > 0) {
        await writeEvents(db, sessionId, selection.events);
        cursor = selection.nextCursor;
        hasCursorChanged = true;
        result.eventWrites += selection.events.length;
      }

      result.polls += 1;

      logger.info("폴링 완료", {
        iteration,
        lap: snapshot.currentLap,
        totalLaps: snapshot.totalLaps,
        status: snapshot.status,
        computedEvents: events.length,
        newEvents: selection.events.length,
        wroteSnapshot: decision.shouldWriteSnapshot,
      });

      if (iteration < POLL_ITERATIONS - 1) {
        await sleep(POLL_INTERVAL_MS);
      }
    }
  } finally {
    // 중간에 실패해도 여기까지 쓴 것은 커서에 남겨야 다음 기동이 다시 쓰지 않는다.
    if (hasCursorChanged) {
      await writeEventWriteCursor(db, sessionId, cursor);
    }
  }

  return result;
};
