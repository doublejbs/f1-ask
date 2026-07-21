import { FieldValue, Firestore } from "firebase-admin/firestore";
import {
  buildWorkerLease,
  CommentaryDocument,
  CommentaryRunContext,
  COMMENTARY_CONTEXT_DOC_ID,
  EventWriteCursor,
  EVENT_CURSOR_DOC_ID,
  firestorePaths,
  parseCommentaryRunContext,
  isLeaseHeld,
  isLeaseOwnedBy,
  LiveRaceSnapshot,
  parseEventWriteCursor,
  parseWorkerLease,
  RaceEvent,
  toSessionDoc,
  WORKER_LEASE_TTL_MS,
} from "@f1/domain";
import { MAX_BATCH_SIZE } from "./WorkerConfig";

// 워커의 Firestore 입출력. 판정 로직은 전부 @f1/domain 의 순수 함수에 있고
// 여기서는 그 결과를 문서에 옮기기만 한다.

// 리스를 트랜잭션으로 잡는다. 이미 유효한 리스가 있으면 false 를 돌려주고
// 호출측은 즉시 종료한다 (docs/16-poller-worker.md §중복 실행 방지).
export const acquireWorkerLease = async (
  db: Firestore,
  sessionId: string,
  ownerId: string,
  nowMs: number,
): Promise<boolean> => {
  const ref = db.doc(firestorePaths.workerLease(sessionId));

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    const lease = parseWorkerLease(existing.data());

    if (isLeaseHeld(lease, nowMs) && lease?.ownerId !== ownerId) {
      return false;
    }

    transaction.set(ref, {
      ...buildWorkerLease(ownerId, nowMs, WORKER_LEASE_TTL_MS),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return true;
  });
};

// 기동이 정상 종료할 때 리스를 즉시 푼다.
//
// TTL 이 한 기동의 최대 실행 시간(100초)에 맞춰져 스케줄 간격(60초)보다 길어졌으므로,
// 짧게 끝난 기동이 자연 만료를 기다리면 다음 기동까지 함께 막힌다 (WorkerLease.ts 참고).
// 내 소유일 때만 지운다 — 만료 사이에 다른 인스턴스가 새로 잡았을 수 있다.
export const releaseWorkerLease = async (
  db: Firestore,
  sessionId: string,
  ownerId: string,
): Promise<void> => {
  const ref = db.doc(firestorePaths.workerLease(sessionId));

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);

    if (!isLeaseOwnedBy(parseWorkerLease(existing.data()), ownerId)) {
      return;
    }

    transaction.delete(ref);
  });
};

// 이전 기동이 남긴 "이미 쓴 이벤트 키" 집합을 읽어 온다.
// 함수는 1분마다 새로 뜨므로 메모리 집합은 인스턴스 간에 유지되지 않는다.
export const readEventWriteCursor = async (
  db: Firestore,
  sessionId: string,
): Promise<EventWriteCursor> => {
  const snapshot = await db
    .doc(firestorePaths.runtimeDoc(sessionId, EVENT_CURSOR_DOC_ID))
    .get();

  return parseEventWriteCursor(snapshot.data());
};

// 기동이 끝날 때 한 번만 저장한다 (폴링마다 저장하면 그 자체가 쓰기 폭증이다).
export const writeEventWriteCursor = async (
  db: Firestore,
  sessionId: string,
  cursor: EventWriteCursor,
): Promise<void> => {
  await db.doc(firestorePaths.runtimeDoc(sessionId, EVENT_CURSOR_DOC_ID)).set({
    writtenKeys: cursor.writtenKeys,
    updatedAt: FieldValue.serverTimestamp(),
  });
};

// 직전 해설과 "이미 만든 해설 키"를 이어받는다. 이벤트 커서와 같은 자리·같은 방식이다
// (docs/18-ai-commentary-worker.md §러닝 컨텍스트의 저장).
export const readCommentaryRunContext = async (
  db: Firestore,
  sessionId: string,
): Promise<CommentaryRunContext> => {
  const snapshot = await db
    .doc(firestorePaths.runtimeDoc(sessionId, COMMENTARY_CONTEXT_DOC_ID))
    .get();

  return parseCommentaryRunContext(snapshot.data());
};

// 기동이 끝날 때 한 번만 저장한다. 해설마다 저장하면 이 문서가 쓰기 폭증이 된다.
export const writeCommentaryRunContext = async (
  db: Firestore,
  sessionId: string,
  context: CommentaryRunContext,
): Promise<void> => {
  await db
    .doc(firestorePaths.runtimeDoc(sessionId, COMMENTARY_CONTEXT_DOC_ID))
    .set({
      recentTextsByVariant: context.recentTextsByVariant,
      generatedKeys: context.generatedKeys,
      failureCounts: context.failureCounts,
      generatedCount: context.generatedCount,
      updatedAt: FieldValue.serverTimestamp(),
    });
};

// 해설 문서. id 가 `{eventId}:{locale}:{explanationLevel}` 라 재기록이 멱등이다.
export const writeCommentaryDocument = async (
  db: Firestore,
  sessionId: string,
  docId: string,
  document: CommentaryDocument,
): Promise<void> => {
  await db.doc(firestorePaths.aiCommentaryDoc(sessionId, docId)).set({
    ...document,
    persistedAt: FieldValue.serverTimestamp(),
  });
};

export const writeLiveSnapshot = async (
  db: Firestore,
  sessionId: string,
  snapshot: LiveRaceSnapshot,
): Promise<void> => {
  await db.doc(firestorePaths.liveCurrent(sessionId)).set({
    ...snapshot,
    persistedAt: FieldValue.serverTimestamp(),
  });
};

export const writeSessionDoc = async (
  db: Firestore,
  sessionId: string,
  snapshot: LiveRaceSnapshot,
): Promise<void> => {
  await db.doc(firestorePaths.session(sessionId)).set(
    {
      ...toSessionDoc(snapshot),
      sessionId,
      persistedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
};

// 이벤트는 deduplicationKey 를 문서 id 로 쓴다. 재기록은 멱등이지만
// 호출측이 이미 신규만 골라 넘기므로 여기 오는 것은 전부 새 이벤트다.
export const writeEvents = async (
  db: Firestore,
  sessionId: string,
  events: readonly RaceEvent[],
): Promise<void> => {
  for (let offset = 0; offset < events.length; offset += MAX_BATCH_SIZE) {
    const chunk = events.slice(offset, offset + MAX_BATCH_SIZE);
    const batch = db.batch();

    for (const event of chunk) {
      batch.set(
        db.doc(firestorePaths.eventDoc(sessionId, event.deduplicationKey)),
        event,
      );
    }

    await batch.commit();
  }
};
