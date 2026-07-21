import { AiCommentary } from "../ai/AiCommentary";
import { ExplanationLevel } from "../ExplanationLevel";
import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { RaceEvent } from "../RaceEvent";
import { RaceEventPriority } from "../RaceEventPriority";
import { SupportedLocale } from "../SupportedLocale";

// Firestore 데이터 소유 경계 (docs/03-firestore-and-auth.md §14, §20).
// 공개 경기 데이터: 서버만 쓰고 클라이언트는 읽는다.
export const firestorePaths = {
  session: (sessionId: string): string => `sessions/${sessionId}`,
  liveCurrent: (sessionId: string): string =>
    `sessions/${sessionId}/live/current`,
  events: (sessionId: string): string => `sessions/${sessionId}/events`,
  eventDoc: (sessionId: string, eventId: string): string =>
    `sessions/${sessionId}/events/${eventId}`,
  // AI 해설. 이벤트와 같은 공개 읽기 자리에 둔다 (docs/18-ai-commentary-worker.md §저장).
  aiCommentary: (sessionId: string): string =>
    `sessions/${sessionId}/aiCommentary`,
  aiCommentaryDoc: (sessionId: string, docId: string): string =>
    `sessions/${sessionId}/aiCommentary/${docId}`,
  // 서버 전용 워커 상태. 규칙에서 클라이언트 읽기/쓰기가 모두 막혀 있다.
  runtimeDoc: (sessionId: string, docId: string): string =>
    `sessions/${sessionId}/runtime/${docId}`,
  workerLease: (sessionId: string): string => `workerLeases/${sessionId}`,
};

export const LIVE_CURRENT_DOC_ID = "current";
// 폴러가 "이미 쓴 이벤트 키"를 이어받는 문서.
export const EVENT_CURSOR_DOC_ID = "eventCursor";
// 폴러가 직전 해설과 "이미 만든 해설 키"를 이어받는 문서.
// eventCursor 와 같은 자리에 둔다 — 둘 다 창당 읽기 1 · 쓰기 1 이다.
export const COMMENTARY_CONTEXT_DOC_ID = "commentaryContext";

export type Unsubscribe = () => void;

// 클라이언트 읽기 경계 (구독). 애플리케이션 코드가 Firestore SDK 를
// 여러 곳에 흩뿌리지 않도록 repository 계층을 둔다.
export interface LiveRaceReadRepository {
  subscribeSnapshot(
    sessionId: string,
    onChange: (snapshot: LiveRaceSnapshot | null) => void,
  ): Unsubscribe;
  // priorities 를 주면 해당 우선순위만 구독한다(주요 이벤트 전용 구독).
  // 생략하면 우선순위 필터 없이 최신순으로 구독한다.
  subscribeEvents(
    sessionId: string,
    limit: number,
    onChange: (events: RaceEvent[]) => void,
    priorities?: RaceEventPriority[],
  ): Unsubscribe;
}

// 워커가 쓴 해설의 클라이언트 읽기 경계 (docs/18-ai-commentary-worker.md §클라이언트).
// live 모드에서만 쓴다 — mock · replay 는 워커가 없어 기존 POST 경로를 유지한다.
export interface CommentaryReadRepository {
  subscribeCommentary(
    sessionId: string,
    locale: SupportedLocale,
    explanationLevel: ExplanationLevel,
    limit: number,
    onChange: (commentary: AiCommentary[]) => void,
  ): Unsubscribe;
}

// Firestore `in` 연산자가 허용하는 최대 값 개수.
export const FIRESTORE_IN_MAX_VALUES = 30;

// 이벤트 구독 쿼리 계획. Firestore SDK 에 의존하지 않는 순수 값으로 표현해
// 우선순위 필터가 실제로 쿼리에 반영되는지를 도메인 레벨에서 검증할 수 있게 한다.
export type EventQueryPlan = {
  collectionPath: string;
  // null 이면 우선순위 필터를 걸지 않는다(전체 구독).
  priorities: RaceEventPriority[] | null;
  orderByField: string;
  isDescending: boolean;
  limit: number;
};

export const buildEventQueryPlan = (
  sessionId: string,
  limit: number,
  priorities?: RaceEventPriority[],
): EventQueryPlan => {
  if (priorities !== undefined && priorities.length === 0) {
    throw new Error("priorities 가 빈 배열이면 Firestore in 쿼리를 만들 수 없다");
  }

  if (
    priorities !== undefined &&
    priorities.length > FIRESTORE_IN_MAX_VALUES
  ) {
    throw new Error(
      `priorities 는 최대 ${FIRESTORE_IN_MAX_VALUES} 개까지 허용된다`,
    );
  }

  return {
    collectionPath: firestorePaths.events(sessionId),
    priorities: priorities ?? null,
    orderByField: "timestamp",
    isDescending: true,
    limit,
  };
};

// 해설 구독 쿼리 계획. 이벤트와 같은 이유로 Firestore SDK 에 의존하지 않는 순수 값이다.
//
// 문서 id 직접 조회(`toCommentaryDocId`)가 아니라 컬렉션 구독을 택한 이유:
// 워커는 해설을 이벤트보다 **늦게** 쓴다. 문서 id 조회는 화면에 뜬 이벤트마다
// 리스너를 만들어야 하고, 이벤트 창이 굴러갈 때마다 수십 개를 붙였다 뗐다 해야 한다.
// 컬렉션 구독은 리스너 1 개로 나중에 도착한 해설까지 그대로 흘려보낸다.
export type CommentaryQueryPlan = {
  collectionPath: string;
  locale: SupportedLocale;
  explanationLevel: ExplanationLevel;
  orderByField: string;
  isDescending: boolean;
  limit: number;
};

export const buildCommentaryQueryPlan = (
  sessionId: string,
  locale: SupportedLocale,
  explanationLevel: ExplanationLevel,
  limit: number,
): CommentaryQueryPlan => {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("해설 구독 limit 은 1 이상의 정수여야 한다");
  }

  return {
    collectionPath: firestorePaths.aiCommentary(sessionId),
    locale,
    explanationLevel,
    orderByField: "timestamp",
    isDescending: true,
    limit,
  };
};

// live/current 문서에 저장할 페이로드. snapshot 은 JSON-safe 하므로 그대로 담고,
// 서버 저장 시각(persistedAt)은 write 시점에 serverTimestamp 로 추가한다.
export const toLiveSnapshotDoc = (
  snapshot: LiveRaceSnapshot,
): Record<string, unknown> => ({ ...snapshot });

// RaceEvent 문서 ID 는 중복 방지를 위해 deduplicationKey 를 사용한다 (docs §16).
export const eventDocId = (event: RaceEvent): string => event.deduplicationKey;

// 세션 메타 문서 (공개).
export const toSessionDoc = (
  snapshot: LiveRaceSnapshot,
): Record<string, unknown> => ({
  schemaVersion: snapshot.schemaVersion,
  sessionId: snapshot.sessionId,
  sessionKey: snapshot.sessionKey,
  meetingKey: snapshot.meetingKey,
  sessionName: snapshot.sessionName,
  sessionType: snapshot.sessionType,
  circuitName: snapshot.circuitName,
  countryCode: snapshot.countryCode,
  status: snapshot.status,
  currentLap: snapshot.currentLap,
  totalLaps: snapshot.totalLaps,
});
