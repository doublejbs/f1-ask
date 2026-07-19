// 시스템 데이터 모드 (docs/02-architecture.md §10)
// 세 모드가 동일한 domain logic 을 공유한다.
export enum DataMode {
  Mock = "mock",
  Replay = "replay",
  Live = "live",
}
