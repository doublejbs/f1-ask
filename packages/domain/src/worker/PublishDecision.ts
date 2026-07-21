import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { toSessionDoc } from "../firestore/LiveRaceRepository";

// 스냅샷 / 세션 메타 문서를 이번 폴링에 실제로 쓸지 판정한다
// (docs/16-poller-worker.md §쓰기 증폭 정리).
//
// 두 문서는 이벤트와 달리 매 폴링마다 같은 문서를 덮어쓴다. 6초 간격 폴링이면
// 레이스당 각각 900회다. 이벤트 쪽을 아무리 줄여도 여기가 남으면 의미가 없다.
//
// - 세션 메타 문서: status / currentLap / totalLaps 정도만 담는다. 랩이 바뀔 때만
//   달라지므로 **내용이 바뀐 폴링에서만** 쓴다 (레이스당 900 → 60~80).
// - 스냅샷 문서: 화면이 실시간으로 구독하는 본체라 줄이기 어렵다. 다만 세션이
//   멈춘 구간(레드 플래그·그리드 대기)에서는 내용이 그대로이므로 건너뛴다.
//   완전히 멈추면 freshness 가 Stale 로 떨어지므로 heartbeat 주기로 바닥을 깐다.

// 내용이 그대로여도 최소 이 간격으로는 스냅샷을 갱신한다.
// FRESHNESS_DELAYED_MAX_MS(15초)보다 짧게 잡아 Stale 로 넘어가지 않게 한다.
export const SNAPSHOT_HEARTBEAT_MS = 12_000;

// 매 폴링마다 값이 바뀌는 필드는 비교에서 제외한다. 이 필드들만 달라진 것은
// "새로 계산했다"는 뜻일 뿐 실제 경기 상태가 움직였다는 뜻이 아니다.
const toComparableSnapshot = (snapshot: LiveRaceSnapshot): string => {
  const { generatedAt, sourceUpdatedAt, version, ...rest } = snapshot;

  void generatedAt;
  void sourceUpdatedAt;
  void version;

  return JSON.stringify(rest);
};

export type PublishState = {
  // 마지막으로 쓴 스냅샷의 비교용 지문.
  snapshotFingerprint: string | null;
  // 마지막으로 스냅샷을 쓴 시각.
  snapshotWrittenAtMs: number | null;
  // 마지막으로 쓴 세션 메타 문서의 비교용 지문.
  sessionFingerprint: string | null;
};

export const EMPTY_PUBLISH_STATE: PublishState = {
  snapshotFingerprint: null,
  snapshotWrittenAtMs: null,
  sessionFingerprint: null,
};

export type PublishDecision = {
  shouldWriteSnapshot: boolean;
  shouldWriteSessionDoc: boolean;
  nextState: PublishState;
};

export type PublishDecisionOptions = {
  nowMs: number;
  heartbeatMs?: number;
};

export const decidePublish = (
  snapshot: LiveRaceSnapshot,
  state: PublishState,
  options: PublishDecisionOptions,
): PublishDecision => {
  const heartbeatMs = options.heartbeatMs ?? SNAPSHOT_HEARTBEAT_MS;
  const snapshotFingerprint = toComparableSnapshot(snapshot);
  const sessionFingerprint = JSON.stringify(toSessionDoc(snapshot));

  const hasSnapshotChanged = snapshotFingerprint !== state.snapshotFingerprint;
  const isHeartbeatDue =
    state.snapshotWrittenAtMs === null ||
    options.nowMs - state.snapshotWrittenAtMs >= heartbeatMs;
  const shouldWriteSnapshot = hasSnapshotChanged || isHeartbeatDue;
  const shouldWriteSessionDoc = sessionFingerprint !== state.sessionFingerprint;

  return {
    shouldWriteSnapshot,
    shouldWriteSessionDoc,
    nextState: {
      snapshotFingerprint,
      snapshotWrittenAtMs: shouldWriteSnapshot
        ? options.nowMs
        : state.snapshotWrittenAtMs,
      sessionFingerprint: shouldWriteSessionDoc
        ? sessionFingerprint
        : state.sessionFingerprint,
    },
  };
};
