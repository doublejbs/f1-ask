// 뉴스 항목의 출처 종류 (docs/28-news-tab.md §공통 모델).
//
// 자동 수집이 현실적으로 가능한 것은 Article(RSS)·YouTube 뿐이다. Instagram·Facebook 은
// 임의 공개 계정 피드 수집이 불가하므로(docs/28 §데이터 소스) 큐레이션 링크/임베드로만
// 들어오지만, 화면 표기·필터를 위해 종류는 정의해 둔다.
export enum NewsSourceKind {
  Article = "article",
  YouTube = "youtube",
  Instagram = "instagram",
  Facebook = "facebook",
}
