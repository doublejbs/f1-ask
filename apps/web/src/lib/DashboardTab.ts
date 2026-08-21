// 모바일 하단 3탭 식별자 (docs/13-race-console.md, docs/17-race-archive.md, docs/28-news-tab.md).
// 「지금」과 「순위」는 레이스 콘솔 하나로 합쳐졌다 — 순위(뒤) + 이벤트 시트(앞).
// 「기록」은 지난 레이스다. 라이브 중에도 찾아볼 수 있어야 해서 빈 상태 안에
// 숨기지 않고 독립 탭으로 둔다.
// 「뉴스」는 경기 전후 소식이다. AI 질문은 경기 탭으로 옮겨(데스크톱 2컬럼·모바일 하단)
// 3번째 탭 슬롯을 뉴스가 쓴다 (docs/28 §3번째 탭을 뉴스로).
export enum DashboardTab {
  Race = "race",
  Archive = "archive",
  News = "news",
}
