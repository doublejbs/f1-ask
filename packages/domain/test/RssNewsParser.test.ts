import { describe, expect, it } from "vitest";
import { NewsCategory } from "../src/news/NewsCategory";
import { categorizeNewsTitle } from "../src/news/NewsCategoryRules";
import { NewsSourceKind } from "../src/news/NewsSourceKind";
import { parseNewsFeedXml } from "../src/news/RssNewsParser";

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <item>
      <title><![CDATA[McLaren brings a new floor upgrade to Zandvoort]]></title>
      <link>https://example.com/f1/news/mclaren-floor/12345/?utm_source=RSS&amp;utm_medium=referral</link>
      <description><![CDATA[<p>The upgrade targets low-speed corners.</p><a class='more' href='#'>Keep reading</a>]]></description>
      <pubDate>Sun, 24 Aug 2026 09:00:00 GMT</pubDate>
      <media:thumbnail url="https://example.com/thumb.jpg" width="480" height="360"/>
    </item>
    <item>
      <title>Stewards hand Verstappen a penalty for track limits</title>
      <link>https://example.com/f1/news/penalty/67890/</link>
      <description>What it means for the result.</description>
      <pubDate>Sun, 24 Aug 2026 08:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Missing date is skipped</title>
      <link>https://example.com/f1/news/nodate/</link>
    </item>
  </channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  <entry>
    <yt:videoId>abc123</yt:videoId>
    <title>Dutch GP Review | F1 Nation Podcast</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
    <published>2026-08-24T11:28:23+00:00</published>
    <media:group>
      <media:thumbnail url="https://i.ytimg.com/vi/abc123/hqdefault.jpg" width="480" height="360"/>
    </media:group>
  </entry>
</feed>`;

describe("categorizeNewsTitle", () => {
  it("규정·팀·결과·일반을 키워드로 가른다", () => {
    expect(categorizeNewsTitle("Stewards issue a penalty")).toBe(
      NewsCategory.Rule,
    );
    expect(categorizeNewsTitle("Ferrari confirms driver line-up")).toBe(
      NewsCategory.TeamUpdate,
    );
    expect(categorizeNewsTitle("Verstappen takes pole in qualifying")).toBe(
      NewsCategory.Result,
    );
    expect(categorizeNewsTitle("A quiet day in the paddock")).toBe(
      NewsCategory.General,
    );
  });

  it("규정이 결과보다 우선한다(겹치는 제목)", () => {
    // "penalty"(규정) + "result"(결과)가 함께 있으면 더 좁은 규정으로.
    expect(
      categorizeNewsTitle("Penalty reshuffles the race result"),
    ).toBe(NewsCategory.Rule);
  });
});

describe("parseNewsFeedXml — RSS", () => {
  const items = parseNewsFeedXml(RSS_FIXTURE, {
    sourceName: "Autosport",
    kind: NewsSourceKind.Article,
  });

  it("유효 항목만 파싱한다(날짜 없는 항목 제외)", () => {
    expect(items).toHaveLength(2);
  });

  it("추적 쿼리를 떼고 안정 url·id 를 만든다", () => {
    expect(items[0]?.url).toBe("https://example.com/f1/news/mclaren-floor/12345/");
    expect(items[0]?.id).toBe(items[0]?.url);
  });

  it("발췌는 HTML·꼬리 링크를 제거한다", () => {
    expect(items[0]?.summary).toBe("The upgrade targets low-speed corners.");
  });

  it("제목 키워드로 카테고리를 정한다", () => {
    expect(items[0]?.category).toBe(NewsCategory.TeamUpdate);
    expect(items[1]?.category).toBe(NewsCategory.Rule);
  });

  it("pubDate 를 ISO 로, media:thumbnail 을 실는다", () => {
    expect(items[0]?.publishedAt).toBe("2026-08-24T09:00:00.000Z");
    expect(items[0]?.thumbnailUrl).toBe("https://example.com/thumb.jpg");
    expect(items[1]?.thumbnailUrl).toBeNull();
  });
});

describe("parseNewsFeedXml — Atom(YouTube)", () => {
  const items = parseNewsFeedXml(ATOM_FIXTURE, {
    sourceName: "F1 (YouTube)",
    kind: NewsSourceKind.YouTube,
  });

  it("videoId·watch 링크·썸네일을 옮긴다", () => {
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe(NewsSourceKind.YouTube);
    expect(items[0]?.id).toBe("abc123");
    expect(items[0]?.url).toBe("https://www.youtube.com/watch?v=abc123");
    expect(items[0]?.thumbnailUrl).toBe(
      "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    );
    expect(items[0]?.publishedAt).toBe("2026-08-24T11:28:23.000Z");
  });
});
