// 워커 리스 (docs/16-poller-worker.md §중복 실행 방지).
//
// 스케줄러 재시도나 실행 지연으로 두 인스턴스가 겹칠 수 있다. 이벤트 쓰기는
// deduplicationKey 를 문서 id 로 쓰므로 멱등이지만, 같은 일을 두 번 하는 것은
// OpenF1 호출과 Firestore 쓰기를 그대로 두 배로 만든다.
//
// 리스 TTL 은 **한 기동의 실제 최대 실행 시간**에 맞춘다.
//
// 이전 값(55초)은 "폴링 창 ≈ 60초 ≈ 스케줄 간격" 을 전제로 스케줄 간격보다 짧게 잡아
// 자연 만료에 기대는 설계였다. AI 해설(docs/18)이 폴링 창 뒤에 붙으면서 그 전제가 깨졌다 —
// 한 기동이 100초까지 간다. TTL 이 55초면 백로그 상황(콜드 스타트·재배포 직후)에서
// 다음 기동이 아직 살아 있는 인스턴스의 만료된 리스를 잡아 겹치고,
// 커서 이중 쓰기와 중복 LLM 호출이 난다.
//
// 근거(functions/src/WorkerConfig.ts 의 값과 같다):
//   폴링 루프  6초 × (10회 - 1) = 54초   ← sleep 은 폴링 사이에만 들어간다
//   OpenF1 지연 여유                6초
//   해설 단계                      36초   ← 12초 호출 최대 3건 (타임아웃이 계약이라 상한이다)
//   마무리 쓰기(커서 · 러닝 컨텍스트) 4초
//                                 ─────
//                                100초   ≤ 함수 타임아웃 120초
//
// TTL 이 스케줄 간격(60초)보다 길어졌으므로 자연 만료에만 기대면 짧게 끝난 기동 뒤의
// 다음 기동까지 막힌다. 그래서 정상 종료 시 리스를 **명시적으로 해제**한다
// (기동당 쓰기 1건 추가 = 분당 1건, 무시할 수준이다).
// 죽은 인스턴스는 해제를 못 하지만 최대 TTL 만큼만 점유하고 풀린다.
export const WORKER_LEASE_TTL_MS = 100_000;

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

// 해제해도 되는 리스인가. 내 TTL 이 만료된 사이 다른 인스턴스가 리스를 새로 잡았을 수 있어
// 소유자가 나일 때만 지운다 — 아니면 남의 리스를 풀어 중복 실행을 만든다.
export const isLeaseOwnedBy = (
  lease: WorkerLease | null,
  ownerId: string,
): boolean => lease !== null && lease.ownerId === ownerId;

export const buildWorkerLease = (
  ownerId: string,
  nowMs: number,
  ttlMs: number = WORKER_LEASE_TTL_MS,
): WorkerLease => ({
  ownerId,
  acquiredAtMs: nowMs,
  expiresAtMs: nowMs + ttlMs,
});
