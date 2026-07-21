// "지금 볼 것" 결정론적 감지기 종류 (docs/19-watch-now.md §감지기와 임계값).
//
// 순서는 방송 보완도 순이다 — A(타이어)와 C(언더컷)는 중계가 구조적으로 보여주지
// 않으므로 가장 값지고, B(간격)와 D(순위)는 중계와 겹친다. 주목도 랭킹(Task 2)이
// 기본 점수를 매길 때 이 근거를 그대로 쓴다.
export enum WatchNowSignalType {
  // A. 타이어가 임계 랩수에 도달했다. 스틴트당 1회만 발화한다.
  TireAge = "tire_age",
  // B. 앞차와의 간격이 임계 아래로 좁혀져 연속 관측에서 유지됐다.
  GapConvergence = "gap_convergence",
  // C. 순위가 인접한 뒤차가 피트인했고 나는 아직 안 들어갔다.
  UndercutThreat = "undercut_threat",
  // D. 기준점 대비 순위가 임계 이상 변동했다.
  PositionSwing = "position_swing",
}
