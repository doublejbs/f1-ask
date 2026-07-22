// "지금 볼 것" 결정론적 감지기 종류 (docs/19-watch-now.md §감지기와 임계값).
//
// 순서는 방송 보완도 순이다 — A(타이어)와 C(언더컷)는 중계가 구조적으로 보여주지
// 않으므로 가장 값지고, B(간격)와 D(순위)는 중계와 겹친다.
export enum WatchNowSignalType {
  // A. 타이어가 임계 랩수에 도달했다. 스틴트당 1회만 발화한다.
  TireAge = "tire_age",
  // B. 앞차와의 간격이 임계 아래로 좁혀져 연속 관측에서 유지됐다.
  GapConvergence = "gap_convergence",
  // C. 순위가 인접한 뒤차가 피트인했고 나는 아직 안 들어갔다.
  UndercutThreat = "undercut_threat",
  // D. 기준점 대비 순위가 임계 이상 변동했다.
  PositionSwing = "position_swing",
  // E. 순위 인접 페어가 N랩 후 배틀 범위(1초 내)에 든다. 워커가 랩타임 추세로 계산해
  // 스냅샷에 실은 예측을 신호로 변환한 것이다(docs/23) — 클라이언트 감지가 아니다.
  // 값은 overtake_forecast 이벤트 타입 문자열과 맞춘다.
  OvertakeForecast = "overtake_forecast",
}
