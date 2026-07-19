import { DataFreshnessStatus } from "./DataFreshnessStatus";

// 데이터 신선도 판정 기준 (docs/02-architecture.md §49)
export const FRESHNESS_LIVE_MAX_MS = 5_000;
export const FRESHNESS_DELAYED_MAX_MS = 15_000;

// 마지막 갱신 이후 경과 시간(ms)으로 신선도를 판정한다.
export const getFreshness = (ageMs: number): DataFreshnessStatus => {
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return DataFreshnessStatus.Unknown;
  }

  if (ageMs <= FRESHNESS_LIVE_MAX_MS) {
    return DataFreshnessStatus.Live;
  }

  if (ageMs <= FRESHNESS_DELAYED_MAX_MS) {
    return DataFreshnessStatus.Delayed;
  }

  return DataFreshnessStatus.Stale;
};

// snapshot 의 sourceUpdatedAt 기준 신선도.
export const getFreshnessFromTimestamp = (
  sourceUpdatedAtIso: string,
  nowMs: number,
): DataFreshnessStatus => {
  const sourceMs = Date.parse(sourceUpdatedAtIso);

  if (Number.isNaN(sourceMs)) {
    return DataFreshnessStatus.Unknown;
  }

  return getFreshness(nowMs - sourceMs);
};
