// 데이터 신선도 상태 (docs/02-architecture.md §49)
export enum DataFreshnessStatus {
  Live = "live",
  Delayed = "delayed",
  Stale = "stale",
  Unknown = "unknown",
}
