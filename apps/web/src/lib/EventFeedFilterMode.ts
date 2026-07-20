// 이벤트 피드 노이즈 제어 모드 (docs/10-race-events.md).
// Primary 는 Critical + High 만, All 은 전체를 노출한다.
export enum EventFeedFilterMode {
  Primary = "primary",
  All = "all",
}
