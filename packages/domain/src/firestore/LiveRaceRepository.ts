import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { RaceEvent } from "../RaceEvent";

// Firestore 데이터 소유 경계 (docs/03-firestore-and-auth.md §14, §20).
// 공개 경기 데이터: 서버만 쓰고 클라이언트는 읽는다.
export const firestorePaths = {
  session: (sessionId: string): string => `sessions/${sessionId}`,
  liveCurrent: (sessionId: string): string =>
    `sessions/${sessionId}/live/current`,
  events: (sessionId: string): string => `sessions/${sessionId}/events`,
  eventDoc: (sessionId: string, eventId: string): string =>
    `sessions/${sessionId}/events/${eventId}`,
};

export const LIVE_CURRENT_DOC_ID = "current";

export type Unsubscribe = () => void;

// 클라이언트 읽기 경계 (구독). 애플리케이션 코드가 Firestore SDK 를
// 여러 곳에 흩뿌리지 않도록 repository 계층을 둔다.
export interface LiveRaceReadRepository {
  subscribeSnapshot(
    sessionId: string,
    onChange: (snapshot: LiveRaceSnapshot | null) => void,
  ): Unsubscribe;
  subscribeEvents(
    sessionId: string,
    limit: number,
    onChange: (events: RaceEvent[]) => void,
  ): Unsubscribe;
}

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
