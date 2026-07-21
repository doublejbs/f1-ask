// 워커 리스 (docs/16-poller-worker.md §중복 실행 방지).
//
// 스케줄러 재시도나 실행 지연으로 두 인스턴스가 겹칠 수 있다. 이벤트 쓰기는
// deduplicationKey 를 문서 id 로 쓰므로 멱등이지만, 같은 일을 두 번 하는 것은
// OpenF1 호출과 Firestore 쓰기를 그대로 두 배로 만든다.
//
// 리스 TTL 은 스케줄 간격(1분)보다 **짧게** 잡는다.
// - 정상 실행: 폴링 창이 끝날 즈음 리스가 자연 만료되므로 해제 쓰기가 필요 없다
//   (기동당 쓰기 1건). 다음 기동이 막히지 않는다.
// - 죽은 인스턴스: 최대 TTL 만큼만 점유하고 풀린다. 영구 점유가 불가능하다.
// TTL 은 함수 최대 실행 시간보다도 짧으므로 좀비 리스가 남지 않는다.
export const WORKER_LEASE_TTL_MS = 55_000;

export type WorkerLease = {
  ownerId: string;
  acquiredAtMs: number;
  expiresAtMs: number;
};

// 임의의 Firestore 문서 데이터를 리스로 복원한다. 형태가 깨졌으면 null(=리스 없음).
export const parseWorkerLease = (data: unknown): WorkerLease | null => {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const raw = data as Record<string, unknown>;
  const ownerId = raw.ownerId;
  const acquiredAtMs = raw.acquiredAtMs;
  const expiresAtMs = raw.expiresAtMs;

  if (
    typeof ownerId !== "string" ||
    typeof acquiredAtMs !== "number" ||
    typeof expiresAtMs !== "number"
  ) {
    return null;
  }

  return { ownerId, acquiredAtMs, expiresAtMs };
};

// 다른 인스턴스가 유효한 리스를 들고 있는가.
export const isLeaseHeld = (
  lease: WorkerLease | null,
  nowMs: number,
): boolean => lease !== null && nowMs < lease.expiresAtMs;

export const buildWorkerLease = (
  ownerId: string,
  nowMs: number,
  ttlMs: number = WORKER_LEASE_TTL_MS,
): WorkerLease => ({
  ownerId,
  acquiredAtMs: nowMs,
  expiresAtMs: nowMs + ttlMs,
});
