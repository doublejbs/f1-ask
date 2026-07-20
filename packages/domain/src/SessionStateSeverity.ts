// 활성 세션 상태의 심각도 (docs/14-event-placement.md "색은 심각도에 따른다").
// 적기 > SC/VSC > 옐로 > 정보성 순서이며, UI 는 이 값으로 칩 색과 정렬을 결정한다.
export enum SessionStateSeverity {
  // 적기 — 경기가 중단된 상태.
  Critical = "critical",
  // 세이프티카 / 버추얼 세이프티카.
  High = "high",
  // 옐로 계열(트랙 전체 옐로, 섹터 옐로, 트랙 위험물).
  Caution = "caution",
  // 정보성(피트레인 폐쇄, 오버테이크 모드 차단, 강우 확률, 종료 상태).
  Info = "info",
}
