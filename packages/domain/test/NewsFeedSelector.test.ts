import { describe, expect, it } from "vitest";
import { NewsCategory } from "../src/news/NewsCategory";
import {
  dedupeNewsItems,
  selectNewsFeed,
  sortNewsItems,
} from "../src/news/NewsFeedSelector";
import { NewsFilter } from "../src/news/NewsFilter";
import { NewsItem } from "../src/news/NewsItem";
import { NewsSourceKind } from "../src/news/NewsSourceKind";

const makeItem = (overrides: Partial<NewsItem> & { id: string }): NewsItem => ({
  kind: NewsSourceKind.Article,
  category: NewsCategory.General,
  title: `Title ${overrides.id}`,
  summary: null,
  url: `https://example.com/${overrides.id}`,
  thumbnailUrl: null,
  sourceName: "Source",
  publishedAt: "2026-08-20T10:00:00.000Z",
  lang: "en",
  ...overrides,
});

describe("dedupeNewsItems", () => {
  it("같은 id 는 더 최신 발행분을 남긴다", () => {
    const older = makeItem({ id: "a", publishedAt: "2026-08-20T09:00:00.000Z", title: "old" });
    const newer = makeItem({ id: "a", publishedAt: "2026-08-20T11:00:00.000Z", title: "new" });

    const result = dedupeNewsItems([older, newer]);

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("new");
  });

  it("서로 다른 id 는 모두 남긴다", () => {
    expect(dedupeNewsItems([makeItem({ id: "a" }), makeItem({ id: "b" })])).toHaveLength(2);
  });
});

describe("sortNewsItems", () => {
  it("발행 시각 내림차순으로 정렬한다", () => {
    const sorted = sortNewsItems([
      makeItem({ id: "old", publishedAt: "2026-08-20T08:00:00.000Z" }),
      makeItem({ id: "new", publishedAt: "2026-08-20T12:00:00.000Z" }),
      makeItem({ id: "mid", publishedAt: "2026-08-20T10:00:00.000Z" }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["new", "mid", "old"]);
  });

  it("같은 시각은 sourceName → id 로 안정 정렬한다", () => {
    const at = "2026-08-20T10:00:00.000Z";
    const sorted = sortNewsItems([
      makeItem({ id: "z", sourceName: "B", publishedAt: at }),
      makeItem({ id: "a", sourceName: "B", publishedAt: at }),
      makeItem({ id: "m", sourceName: "A", publishedAt: at }),
    ]);

    // sourceName A 가 먼저, 같은 B 안에서는 id 오름차순.
    expect(sorted.map((item) => item.id)).toEqual(["m", "a", "z"]);
  });
});

describe("selectNewsFeed", () => {
  const items = [
    makeItem({ id: "r", category: NewsCategory.Result, publishedAt: "2026-08-20T12:00:00.000Z" }),
    makeItem({ id: "u", category: NewsCategory.Rule, publishedAt: "2026-08-20T11:00:00.000Z" }),
    makeItem({ id: "t", category: NewsCategory.TeamUpdate, publishedAt: "2026-08-20T10:00:00.000Z" }),
    makeItem({ id: "v", kind: NewsSourceKind.YouTube, category: NewsCategory.General, publishedAt: "2026-08-20T09:00:00.000Z" }),
    makeItem({ id: "s", kind: NewsSourceKind.Instagram, category: NewsCategory.General, publishedAt: "2026-08-20T08:00:00.000Z" }),
    makeItem({ id: "f", kind: NewsSourceKind.Facebook, category: NewsCategory.General, publishedAt: "2026-08-20T07:00:00.000Z" }),
  ];

  it("All 은 전부, 정렬된 채로 돌려준다", () => {
    expect(selectNewsFeed(items, NewsFilter.All).map((i) => i.id)).toEqual([
      "r", "u", "t", "v", "s", "f",
    ]);
  });

  it("카테고리 필터는 해당 카테고리만 남긴다", () => {
    expect(selectNewsFeed(items, NewsFilter.Result).map((i) => i.id)).toEqual(["r"]);
    expect(selectNewsFeed(items, NewsFilter.Rule).map((i) => i.id)).toEqual(["u"]);
    expect(selectNewsFeed(items, NewsFilter.TeamUpdate).map((i) => i.id)).toEqual(["t"]);
  });

  it("Video 는 YouTube 만 남긴다", () => {
    expect(selectNewsFeed(items, NewsFilter.Video).map((i) => i.id)).toEqual(["v"]);
  });

  it("Social 은 Instagram·Facebook 을 남긴다", () => {
    expect(selectNewsFeed(items, NewsFilter.Social).map((i) => i.id)).toEqual(["s", "f"]);
  });
});
