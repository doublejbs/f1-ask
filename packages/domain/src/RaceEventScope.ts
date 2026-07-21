// 이벤트 범위 (docs/14-event-placement.md 축 1).
// 세션 이벤트는 상단 스트립으로, 드라이버 이벤트는 순위 행으로 배치된다.
export enum RaceEventScope {
  // 경기 전체에 적용되는 상황(플래그, SC, 피트레인 등).
  Session = "session",
  // 특정 드라이버에게 귀속되는 사건(페널티, 추월, 피트스톱 등).
  Driver = "driver",
}
