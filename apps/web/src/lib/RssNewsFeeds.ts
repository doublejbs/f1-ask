import { NewsSourceKind } from "@f1/domain";

// 실제 F1 뉴스 RSS/Atom 피드 목록 (docs/28 §데이터 소스). 전부 공개 피드라 API 키가 없다 —
// 서버 라우트(/api/news)가 서버측에서 가져오므로 CORS 도 무관하다. 실패한 피드는 건너뛴다.
//
// 유튜브 공식 채널은 Atom 피드(videos.xml)라 종류를 YouTube 로 둔다 — "영상" 필터에 걸린다.
export type NewsFeedConfig = {
  url: string;
  sourceName: string;
  kind: NewsSourceKind;
};

export const NEWS_FEEDS: NewsFeedConfig[] = [
  {
    url: "https://www.autosport.com/rss/feed/f1",
    sourceName: "Autosport",
    kind: NewsSourceKind.Article,
  },
  {
    url: "https://www.motorsport.com/rss/f1/news/",
    sourceName: "Motorsport.com",
    kind: NewsSourceKind.Article,
  },
  {
    url: "https://www.formula1.com/content/fom-website/en/latest/all.xml",
    sourceName: "Formula 1",
    kind: NewsSourceKind.Article,
  },
  {
    // F1 공식 유튜브 채널 Atom 피드.
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCB_qr75-ydFVKSF9Dmo6izg",
    sourceName: "F1 (YouTube)",
    kind: NewsSourceKind.YouTube,
  },
];
