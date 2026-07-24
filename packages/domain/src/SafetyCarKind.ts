// 중립화 구간의 종류. narrative 의 safetyCars 항목이 SC(풀 세이프티 카)와
// VSC(버추얼 세이프티 카)를 구분해 담는다. 판정 자체는 OpenF1SafetyCarClassification 이
// 하고(두 벌 금지), 여기서는 그 결과(SessionStatus)를 narrative 표현으로 옮길 때만 쓴다.
export enum SafetyCarKind {
  Sc = "sc",
  Vsc = "vsc",
}
