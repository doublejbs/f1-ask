// 이벤트 바텀 시트의 스냅 단계 (docs/13-race-console.md 원칙 2).
// 접힘: 핸들 + 최신 1건 / 기본: 화면 45%(기본값) / 펼침: 화면 85%.
export enum EventSheetSnap {
  Collapsed = "collapsed",
  Default = "default",
  Expanded = "expanded",
}
