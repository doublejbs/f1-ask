import { NEWS_FEEDS, NewsFeedConfig } from "@/lib/RssNewsFeeds";
import {
  dedupeNewsItems,
  NewsItem,
  parseNewsFeedXml,
  sortNewsItems,
} from "@f1/domain";
import { NextResponse } from "next/server";

// 실제 F1 뉴스 RSS/Atom 을 서버측에서 모아 정규화해 돌려주는 라우트 (docs/28).
//
// 서버에서만 외부 피드를 가져온다 — 클라이언트는 CORS·파서 없이 이 JSON 만 소비한다.
// 결과는 5분 캐시한다(뉴스는 실시간이 아니고, 매 방문마다 외부 피드를 때리지 않게).
export const revalidate = 300;

// 피드 한 개가 느리거나 죽어도 전체가 막히면 안 된다 — 개별 타임아웃 + allSettled.
const FEED_TIMEOUT_MS = 8000;
const MAX_ITEMS = 40;

const fetchFeed = async (feed: NewsFeedConfig): Promise<NewsItem[]> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

    const response = await fetch(feed.url, {
      signal: controller.signal,
      // 일부 피드는 브라우저 UA 를 요구한다(봇 차단). 표기용 UA 를 단다.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; F1SecondScreen/1.0)" },
      next: { revalidate },
    });

    clearTimeout(timer);

    if (!response.ok) {
      return [];
    }

    const xml = await response.text();

    return parseNewsFeedXml(xml, {
      sourceName: feed.sourceName,
      kind: feed.kind,
    });
  } catch {
    // 네트워크 오류·타임아웃·파싱 실패 — 이 피드만 건너뛴다.
    return [];
  }
};

export const GET = async () => {
  const settled = await Promise.allSettled(NEWS_FEEDS.map(fetchFeed));

  const collected = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  const items = sortNewsItems(dedupeNewsItems(collected)).slice(0, MAX_ITEMS);

  return NextResponse.json({ items });
};
