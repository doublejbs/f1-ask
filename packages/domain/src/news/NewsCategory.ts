// 뉴스 항목의 주제 분류 (docs/28-news-tab.md §분류·정렬).
//
// 경기 전후로 팬이 찾는 세 축(결과·규정·팀 업데이트)과 그 외 일반. 분류는 결정론적
// 규칙(소스 종류 + 제목 키워드)으로 정한다 — LLM 을 쓰지 않는다.
export enum NewsCategory {
  Result = "result",
  Rule = "rule",
  TeamUpdate = "team_update",
  General = "general",
}
