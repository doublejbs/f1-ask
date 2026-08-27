import { NewsCategory } from "./NewsCategory";
import { NewsFilter } from "./NewsFilter";
import { NewsItem } from "./NewsItem";
import { NewsSourceKind } from "./NewsSourceKind";

// 뉴스 피드 정리 — 중복 제거 → 정렬 → 필터. 전부 결정론이다(docs/28 §분류·정렬).
// LLM 을 쓰지 않는다.

// id 기준 중복 제거. 여러 소스가 같은 기사를 실으면 **더 최신 발행분**을 남긴다(같은 기사가
// 업데이트되며 시각이 갱신되는 경우). 시각이 같으면 먼저 온 것을 남겨 결정론을 지킨다.
export const dedupeNewsItems = (items: NewsItem[]): NewsItem[] => {
  const byId = new Map<string, NewsItem>();

  for (const item of items) {
    const existing = byId.get(item.id);

    if (existing === undefined || item.publishedAt > existing.publishedAt) {
      byId.set(item.id, item);
    }
  }

  return [...byId.values()];
};

// 발행 시각 내림차순. 같은 시각은 sourceName → id 로 안정 정렬해 매 로드 순서가 흔들리지
// 않게 한다(폴링·재조회에 자리가 바뀌면 읽던 위치를 잃는다).
export const sortNewsItems = (items: NewsItem[]): NewsItem[] =>
  [...items].sort((left, right) => {
    if (left.publishedAt !== right.publishedAt) {
      return left.publishedAt < right.publishedAt ? 1 : -1;
    }

    if (left.sourceName !== right.sourceName) {
      return left.sourceName < right.sourceName ? -1 : 1;
    }

    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });

// 한 항목이 필터에 걸리는가. Video·Social 은 소스 종류로, 나머지는 카테고리로 판정한다.
const matchesFilter = (item: NewsItem, filter: NewsFilter): boolean => {
  switch (filter) {
    case NewsFilter.All:
      return true;
    case NewsFilter.Result:
      return item.category === NewsCategory.Result;
    case NewsFilter.Rule:
      return item.category === NewsCategory.Rule;
    case NewsFilter.TeamUpdate:
      return item.category === NewsCategory.TeamUpdate;
    case NewsFilter.Video:
      return item.kind === NewsSourceKind.YouTube;
    case NewsFilter.Social:
      return (
        item.kind === NewsSourceKind.Instagram ||
        item.kind === NewsSourceKind.Facebook
      );
    default:
      return false;
  }
};

// 중복 제거 → 정렬 → 필터를 한 번에. 화면은 이 결과만 그린다.
export const selectNewsFeed = (
  items: NewsItem[],
  filter: NewsFilter,
): NewsItem[] =>
  sortNewsItems(dedupeNewsItems(items)).filter((item) =>
    matchesFilter(item, filter),
  );
