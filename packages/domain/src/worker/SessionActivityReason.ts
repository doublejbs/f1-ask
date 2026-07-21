// 워커가 폴링을 할지 말지 판정한 결과의 사유.
// 로그에 그대로 남겨 "왜 안 돌았는지"를 추적할 수 있게 한다.
export enum SessionActivityReason {
  // 세션 창 안이다 — 폴링한다.
  Active = "active",
  // 세션 시작 전이다 (pre-roll 보다도 이르다).
  BeforeStart = "before_start",
  // 세션이 끝나고 grace 까지 지났다.
  AfterEnd = "after_end",
  // 세션 시각을 알 수 없다 — 비용 가드로 폴링하지 않는다.
  UnknownSchedule = "unknown_schedule",
}
