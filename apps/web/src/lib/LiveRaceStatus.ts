// 라이브 경기 데이터의 도달 상태 (docs/17-race-archive.md §화면).
// Connecting 과 NoSession 을 구분하지 못하면 세션이 없을 때도 로딩 화면이
// 무한히 도는 것처럼 보인다.
export enum LiveRaceStatus {
  // 아직 첫 응답이 오지 않았다.
  Connecting = "connecting",
  // 응답은 왔지만 진행 중인 세션 문서가 없다.
  NoSession = "no_session",
  // 스냅샷이 있다.
  Ready = "ready",
}
