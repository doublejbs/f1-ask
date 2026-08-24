import { categorizeNewsTitle } from "./NewsCategoryRules";
import { NewsItem } from "./NewsItem";
import { NewsSourceKind } from "./NewsSourceKind";

// RSS 2.0 · Atom 피드 XML 을 우리 NewsItem 으로 옮기는 **순수 파서** (docs/28 §데이터 소스).
//
// 네트워크(fetch)는 웹 서버 라우트가 맡고, 여기는 문자열 → 객체 변환만 한다 — 도메인은
// 브라우저·Node API 에 의존하지 않고 픽스처로 테스트된다. 정식 XML 파서 의존성을 더하지
// 않고, 주요 F1 피드가 내는 well-formed RSS/Atom 을 정규식으로 뽑는다(불완전 입력은 건너뜀).

// 소스별 표기·종류. url 은 웹 계층(네트워크)이 들고 있고, 여기엔 넘어오지 않는다.
export type NewsFeedSource = {
  sourceName: string;
  kind: NewsSourceKind;
};

// 한 소스에서 뽑을 최대 항목 수. 피드가 수십 개를 실어도 최신 몇 개면 충분하다.
const MAX_ITEMS_PER_FEED = 20;

const stripCdata = (text: string): string =>
  text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

const decodeEntities = (text: string): string =>
  text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

// CDATA 를 먼저 벗겨야 한다 — `<![CDATA[…]]>` 는 `<[^>]*>` 태그 패턴에 통째로 걸려
// 내용이 지워지기 때문이다(제목이 CDATA 면 빈 문자열이 된다). 그다음 태그 제거·엔티티 디코드.
const stripHtml = (text: string): string =>
  decodeEntities(stripCdata(text).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

// 블록 안에서 <tag>…</tag> 첫 매치의 내부 텍스트(디코드·태그 제거).
const pickText = (block: string, tag: string): string | null => {
  const match = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`,
    "i",
  ).exec(block);

  return match === null ? stripAndNull(null) : stripAndNull(match[1]);
};

const stripAndNull = (raw: string | null | undefined): string | null => {
  if (raw === null || raw === undefined) {
    return null;
  }

  const text = stripHtml(raw);
  return text.length === 0 ? null : text;
};

// 특정 태그의 속성값(예: <link href="…"> · <media:thumbnail url="…">).
const pickAttr = (
  block: string,
  tag: string,
  attr: string,
  requireAttrs?: RegExp,
): string | null => {
  const tagRegex = new RegExp(`<${tag}\\s[^>]*?>`, "gi");
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(block)) !== null) {
    const openTag = match[0];

    if (requireAttrs !== undefined && !requireAttrs.test(openTag)) {
      continue;
    }

    const attrMatch = new RegExp(`\\b${attr}="([^"]*)"`, "i").exec(openTag);
    const value = attrMatch?.[1];

    if (value !== undefined && value.length > 0) {
      return decodeEntities(value);
    }
  }

  return null;
};

const toIsoDate = (raw: string | null): string | null => {
  if (raw === null) {
    return null;
  }

  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
};

// 기사 링크에서 추적 쿼리(utm 등)를 떼 안정 id 를 만든다. 유튜브(watch?v=)는 쿼리가 곧
// 식별자이므로 이 함수를 쓰지 않는다.
const canonicalArticleUrl = (url: string): string => {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
};

const extractBlocks = (xml: string, tag: string): string[] => {
  const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null && blocks.length < MAX_ITEMS_PER_FEED) {
    if (match[1] !== undefined) {
      blocks.push(match[1]);
    }
  }

  return blocks;
};

const parseRssItem = (
  block: string,
  source: NewsFeedSource,
): NewsItem | null => {
  const title = pickText(block, "title");
  const link = pickText(block, "link");
  const publishedAt = toIsoDate(pickText(block, "pubDate"));

  if (title === null || link === null || publishedAt === null) {
    return null;
  }

  const url = canonicalArticleUrl(link);
  const summaryRaw = pickText(block, "description");
  // 발췌는 "Keep reading"/"Read more" 꼬리와 과한 길이를 자른다.
  const summary =
    summaryRaw === null
      ? null
      : truncateSummary(summaryRaw.replace(/\s*(keep reading|read more).*$/i, ""));
  const thumbnailUrl =
    pickAttr(block, "media:thumbnail", "url") ??
    pickAttr(block, "media:content", "url") ??
    pickAttr(block, "enclosure", "url");

  return {
    id: url,
    kind: source.kind,
    category: categorizeNewsTitle(title),
    title,
    summary,
    url,
    thumbnailUrl,
    sourceName: source.sourceName,
    publishedAt,
    lang: "en",
  };
};

const parseAtomEntry = (
  block: string,
  source: NewsFeedSource,
): NewsItem | null => {
  const title = pickText(block, "title");
  // Atom link 는 <link rel="alternate" href="…">. rel 이 없으면 첫 링크를 쓴다.
  const link =
    pickAttr(block, "link", "href", /rel="alternate"/i) ??
    pickAttr(block, "link", "href");
  const publishedAt = toIsoDate(
    pickText(block, "published") ?? pickText(block, "updated"),
  );

  if (title === null || link === null || publishedAt === null) {
    return null;
  }

  const videoId = pickText(block, "yt:videoId");
  const thumbnailUrl = pickAttr(block, "media:thumbnail", "url");

  return {
    id: videoId ?? link,
    kind: source.kind,
    category: categorizeNewsTitle(title),
    title,
    summary: null,
    url: link,
    thumbnailUrl,
    sourceName: source.sourceName,
    publishedAt,
    lang: "en",
  };
};

const SUMMARY_MAX = 200;

const truncateSummary = (text: string): string | null => {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.length <= SUMMARY_MAX
    ? trimmed
    : `${trimmed.slice(0, SUMMARY_MAX).trimEnd()}…`;
};

// 피드 XML 한 편을 NewsItem 배열로. RSS(<item>)·Atom(<entry>) 을 자동 판별한다.
// 파싱 불가한 항목은 조용히 건너뛴다(불완전 입력이 화면을 깨지 않게).
export const parseNewsFeedXml = (
  xml: string,
  source: NewsFeedSource,
): NewsItem[] => {
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const blocks = extractBlocks(xml, isAtom ? "entry" : "item");
  const parse = isAtom ? parseAtomEntry : parseRssItem;

  const items: NewsItem[] = [];

  for (const block of blocks) {
    const item = parse(block, source);

    if (item !== null) {
      items.push(item);
    }
  }

  return items;
};
