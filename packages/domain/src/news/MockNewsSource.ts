import { NewsCategory } from "./NewsCategory";
import { NewsItem, NewsSource } from "./NewsItem";
import { NewsSourceKind } from "./NewsSourceKind";

// 개발·오프라인용 결정론적 뉴스 소스 (docs/28-news-tab.md §Mock 뉴스 소스).
//
// 앱 전체가 mock 모드로 외부 의존 없이 도는 원칙(docs/01)을 뉴스에도 적용한다. 라이브
// 소스(RSS·YouTube)와 같은 NewsSource 인터페이스를 구현하므로 교체가 화면에 영향을 주지
// 않는다. 발행 시각은 기준 시각(nowMs)에서 역산해 상대 시간이 자연스럽게 보이도록 한다.
//
// URL 은 실재 링크가 아니라 example.com 자리표시자다 — Mock 은 렌더·정렬·필터 검증용이고,
// 실제 클릭 도달은 라이브 소스의 몫이다.

const HOUR_MS = 60 * 60 * 1000;

type MockSeed = Omit<NewsItem, "publishedAt"> & { hoursAgo: number };

const MOCK_SEEDS: MockSeed[] = [
  {
    id: "mock-result-vegas-review",
    kind: NewsSourceKind.Article,
    category: NewsCategory.Result,
    title: "Race review: a strategic thriller decides the podium",
    summary: "How a late safety car reshuffled the top three in the closing laps.",
    url: "https://example.com/news/race-review",
    thumbnailUrl: null,
    sourceName: "The Race",
    lang: "en",
    hoursAgo: 2,
  },
  {
    id: "mock-rule-2027-power-unit",
    kind: NewsSourceKind.Article,
    category: NewsCategory.Rule,
    title: "FIA confirms 2027 power unit regulation tweaks",
    summary: "Revised fuel-flow limits and updated energy-recovery rules explained.",
    url: "https://example.com/news/2027-pu-rules",
    thumbnailUrl: null,
    sourceName: "Autosport",
    lang: "en",
    hoursAgo: 6,
  },
  {
    id: "mock-team-mclaren-upgrade",
    kind: NewsSourceKind.Article,
    category: NewsCategory.TeamUpdate,
    title: "McLaren brings a new floor package this weekend",
    summary: "The upgrade targets low-speed corner performance ahead of the race.",
    url: "https://example.com/news/mclaren-floor",
    thumbnailUrl: null,
    sourceName: "Motorsport.com",
    lang: "en",
    hoursAgo: 9,
  },
  {
    id: "mock-video-quali-highlights",
    kind: NewsSourceKind.YouTube,
    category: NewsCategory.Result,
    title: "Qualifying highlights",
    summary: "Every session's best laps in three minutes.",
    url: "https://example.com/watch/quali-highlights",
    thumbnailUrl: null,
    sourceName: "F1 공식",
    lang: "en",
    hoursAgo: 14,
  },
  {
    id: "mock-team-ferrari-lineup",
    kind: NewsSourceKind.Article,
    category: NewsCategory.TeamUpdate,
    title: "Ferrari confirms driver line-up for next season",
    summary: "The team locks in its pairing after weeks of speculation.",
    url: "https://example.com/news/ferrari-lineup",
    thumbnailUrl: null,
    sourceName: "The Race",
    lang: "en",
    hoursAgo: 20,
  },
  {
    id: "mock-rule-penalty-review",
    kind: NewsSourceKind.Article,
    category: NewsCategory.Rule,
    title: "Stewards revise penalty guidelines for track limits",
    summary: "What the updated enforcement means for drivers this weekend.",
    url: "https://example.com/news/track-limits",
    thumbnailUrl: null,
    sourceName: "Autosport",
    lang: "en",
    hoursAgo: 28,
  },
  {
    id: "mock-social-driver-post",
    kind: NewsSourceKind.Instagram,
    category: NewsCategory.General,
    title: "Behind the scenes from the paddock",
    summary: "A driver's photo set from the build-up to race day.",
    url: "https://example.com/social/paddock",
    thumbnailUrl: null,
    sourceName: "Instagram",
    lang: "en",
    hoursAgo: 30,
  },
  {
    id: "mock-video-team-radio",
    kind: NewsSourceKind.YouTube,
    category: NewsCategory.General,
    title: "Best team radio of the weekend",
    summary: "The funniest and most dramatic messages from the pit wall.",
    url: "https://example.com/watch/team-radio",
    thumbnailUrl: null,
    sourceName: "F1 공식",
    lang: "en",
    hoursAgo: 40,
  },
];

// 기준 시각(nowMs)에서 역산해 발행 시각을 채운 Mock 항목을 만든다.
export const buildMockNewsItems = (nowMs: number): NewsItem[] =>
  MOCK_SEEDS.map(({ hoursAgo, ...rest }) => ({
    ...rest,
    publishedAt: new Date(nowMs - hoursAgo * HOUR_MS).toISOString(),
  }));

// NewsSource 구현. 라이브 소스와 교체 가능하다.
export class MockNewsSource implements NewsSource {
  private readonly nowMs: number;

  constructor(nowMs: number = Date.now()) {
    this.nowMs = nowMs;
  }

  load(): Promise<NewsItem[]> {
    return Promise.resolve(buildMockNewsItems(this.nowMs));
  }
}
