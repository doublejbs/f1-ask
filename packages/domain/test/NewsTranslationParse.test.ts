import { describe, expect, it } from "vitest";
import { NewsItem } from "../src/news/NewsItem";
import { NewsCategory } from "../src/news/NewsCategory";
import { NewsSourceKind } from "../src/news/NewsSourceKind";
import { applyNewsTranslation } from "../src/news/NewsTranslationParse";

const item = (over: Partial<NewsItem>): NewsItem => ({
  id: "a",
  kind: NewsSourceKind.Article,
  category: NewsCategory.Result,
  title: "Verstappen wins",
  summary: "A dominant drive.",
  url: "https://x/a",
  thumbnailUrl: null,
  sourceName: "The Race",
  publishedAt: "2026-08-24T00:00:00.000Z",
  lang: "en",
  ...over,
});

describe("applyNewsTranslation", () => {
  it("id 로 매칭해 제목·요약을 번역으로 바꾸고 lang 을 대상 로케일로", () => {
    const items = [item({ id: "a" }), item({ id: "b", title: "Norris pole" })];
    const llm = `\`\`\`json
[{"id":"a","title":"베르스타펜 우승","summary":"압도적인 주행."},{"id":"b","title":"노리스 폴포지션","summary":""}]
\`\`\``;

    const out = applyNewsTranslation(items, llm, "ko");

    expect(out[0]?.title).toBe("베르스타펜 우승");
    expect(out[0]?.summary).toBe("압도적인 주행.");
    expect(out[0]?.lang).toBe("ko");
    // 빈 번역 요약은 원문 유지.
    expect(out[1]?.title).toBe("노리스 폴포지션");
    expect(out[1]?.summary).toBe("A dominant drive.");
  });

  it("매핑 없는 항목은 원문 유지", () => {
    const items = [item({ id: "a" })];
    const out = applyNewsTranslation(items, '[{"id":"zzz","title":"x"}]', "ko");
    expect(out[0]?.title).toBe("Verstappen wins");
    expect(out[0]?.lang).toBe("en");
  });

  it("손상된/빈 응답이면 전부 원문 유지", () => {
    const items = [item({ id: "a" })];
    expect(applyNewsTranslation(items, "not json at all", "ko")[0]?.title).toBe(
      "Verstappen wins",
    );
    expect(applyNewsTranslation(items, "", "ko")[0]?.title).toBe(
      "Verstappen wins",
    );
  });
});
