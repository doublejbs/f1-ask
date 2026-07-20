// 인시던트 조사 상태 (Investigation 이벤트의 status params).
//
// F1 레이스 컨트롤에서 `NOTED` 는 스튜어드가 인시던트를 "접수"했다는 뜻이지 종결이 아니다.
// 종결은 `NO FURTHER ACTION` / `NO FURTHER INVESTIGATION` / `INVESTIGATION COMPLETE` 계열로
// 별도 통보된다. boolean 으로는 접수와 종결을 구분할 수 없어 3-상태로 표현한다.
export enum InvestigationStatus {
  // NOTED — 스튜어드가 인시던트를 접수했다. 조사 개시 여부는 아직 미정이다.
  Noted = "noted",
  // WILL BE INVESTIGATED / UNDER INVESTIGATION — 조사가 진행 중이다.
  UnderInvestigation = "under_investigation",
  // NO FURTHER ACTION / NO FURTHER INVESTIGATION / INVESTIGATION COMPLETE — 조사가 종료됐다.
  Concluded = "concluded",
}
