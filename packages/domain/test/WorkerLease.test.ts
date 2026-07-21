import { describe, expect, it } from "vitest";
import {
  buildWorkerLease,
  isLeaseHeld,
  parseWorkerLease,
  WORKER_LEASE_TTL_MS,
} from "../src/worker/WorkerLease";

const NOW = Date.parse("2026-07-19T13:00:00.000Z");
// Cloud Scheduler 최소 간격.
const SCHEDULE_INTERVAL_MS = 60_000;

describe("워커 리스", () => {
  it("TTL 이 스케줄 간격보다 짧다", () => {
    // 정상 실행이 끝날 즈음 자연 만료돼야 다음 기동이 막히지 않는다.
    expect(WORKER_LEASE_TTL_MS).toBeLessThan(SCHEDULE_INTERVAL_MS);
  });

  it("갓 잡은 리스는 유효하다", () => {
    expect(isLeaseHeld(buildWorkerLease("a", NOW), NOW + 1000)).toBe(true);
  });

  it("TTL 이 지나면 풀린다 — 죽은 인스턴스가 영구 점유하지 못한다", () => {
    const lease = buildWorkerLease("dead-instance", NOW);

    expect(isLeaseHeld(lease, NOW + WORKER_LEASE_TTL_MS + 1)).toBe(false);
  });

  it("다음 스케줄 시점에는 이전 실행의 리스가 이미 풀려 있다", () => {
    const lease = buildWorkerLease("previous", NOW);

    expect(isLeaseHeld(lease, NOW + SCHEDULE_INTERVAL_MS)).toBe(false);
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
