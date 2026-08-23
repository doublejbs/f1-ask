// 뉴스 탭 상단 필터 (docs/28-news-tab.md §UX).
//
// 카테고리(결과·규정·팀)와 소스 종류(영상·소셜)를 한 축으로 합친 화면 필터다. All 은 전체.
// General 카테고리는 전용 칩이 없다 — All 에서만 보인다.
export enum NewsFilter {
  All = "all",
  Result = "result",
  Rule = "rule",
  TeamUpdate = "team_update",
  // 소스 종류 기반: 영상 = YouTube.
  Video = "video",
  // 소스 종류 기반: 소셜 = Instagram · Facebook.
  Social = "social",
}

// 칩 노출 순서. All 을 맨 앞에 둔다.
export const NEWS_FILTERS: NewsFilter[] = [
  NewsFilter.All,
  NewsFilter.Result,
  NewsFilter.Rule,
  NewsFilter.TeamUpdate,
  NewsFilter.Video,
  NewsFilter.Social,
];
