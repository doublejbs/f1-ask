import { describe, expect, it } from "vitest";
import {
  buildWorkerLease,
  isLeaseHeld,
  isLeaseOwnedBy,
  parseWorkerLease,
  WORKER_LEASE_TTL_MS,
} from "../src/worker/WorkerLease";

const NOW = Date.parse("2026-07-19T13:00:00.000Z");
// 한 기동의 실제 최대 실행 시간(WorkerLease.ts 의 계산: 54+6+36+4초).
const MAX_RUN_MS = 100_000;
// 함수 최대 실행 시간(functions/src/WorkerConfig.ts 의 FUNCTION_TIMEOUT_SECONDS).
const FUNCTION_TIMEOUT_MS = 120_000;

describe("워커 리스", () => {
  it("TTL 이 실제 최대 실행 시간을 덮는다", () => {
    // 폴링 창 뒤에 붙은 해설 단계까지 리스가 살아 있어야 다음 기동이 겹치지 않는다.
    expect(WORKER_LEASE_TTL_MS).toBeGreaterThanOrEqual(MAX_RUN_MS);
  });

  it("TTL 이 함수 타임아웃보다 짧다 — 좀비 리스가 남지 않는다", () => {
    expect(WORKER_LEASE_TTL_MS).toBeLessThan(FUNCTION_TIMEOUT_MS);
  });

  it("갓 잡은 리스는 유효하다", () => {
    expect(isLeaseHeld(buildWorkerLease("a", NOW), NOW + 1000)).toBe(true);
  });

  it("TTL 이 지나면 풀린다 — 죽은 인스턴스가 영구 점유하지 못한다", () => {
    const lease = buildWorkerLease("dead-instance", NOW);

    expect(isLeaseHeld(lease, NOW + WORKER_LEASE_TTL_MS + 1)).toBe(false);
  });

  it("아직 돌고 있는 기동의 리스는 다음 스케줄 시점에도 유효하다", () => {
    // TTL 이 스케줄 간격보다 길어졌다. 정상 종료는 명시적 해제로 풀고,
    // 죽은 인스턴스만 TTL 만료를 기다린다.
    const lease = buildWorkerLease("previous", NOW);

    expect(isLeaseHeld(lease, NOW + 60_000)).toBe(true);
  });

  it("해제는 소유자가 나일 때만 허용된다", () => {
    const lease = buildWorkerLease("me", NOW);

    expect(isLeaseOwnedBy(lease, "me")).toBe(true);
    expect(isLeaseOwnedBy(lease, "someone-else")).toBe(false);
    expect(isLeaseOwnedBy(null, "me")).toBe(false);
  });

  it("리스가 없으면 잡히지 않은 것으로 본다", () => {
    expect(isLeaseHeld(null, NOW)).toBe(false);
  });

  it("문서를 리스로 복원한다", () => {
    const lease = buildWorkerLease("owner-1", NOW);

    expect(parseWorkerLease({ ...lease })).toEqual(lease);
  });

  it("형태가 깨진 문서는 리스 없음으로 본다", () => {
    expect(parseWorkerLease(null)).toBeNull();
    expect(parseWorkerLease({ ownerId: "a" })).toBeNull();
    expect(parseWorkerLease({ ownerId: 1, acquiredAtMs: 1, expiresAtMs: 2 })).toBeNull();
  });
});
