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
//
// contextSummary(원본 요약)도 제외한다. 요약은 driver 상태와 함께 움직이는 게
// 보통이라 대개 본체 변화에 동반하지만, 정지 구간에서 뒤늦게 도착한 pit_duration
// 이 중앙값을 바꾸거나 추월 최다 동점이 재계산되는 것처럼 **본체는 그대로인데
// 요약만 미세 변동**하는 순간이 있다. 이걸 지문에 넣으면 경기 상태가 안 움직였는데
// 스냅샷을 다시 쓰게 되어 쓰기 증폭이 된다(docs/16 에서 크게 데인 그 문제).
// 요약이 필요한 소비자(AI 질문)는 heartbeat 주기로 갱신되는 스냅샷으로 충분하다.
const toComparableSnapshot = (snapshot: LiveRaceSnapshot): string => {
  const { generatedAt, sourceUpdatedAt, version, contextSummary, ...rest } =
    snapshot;

  void generatedAt;
  void sourceUpdatedAt;
  void version;
  void contextSummary;

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
