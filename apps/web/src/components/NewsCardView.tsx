"use client";

import { Dictionary } from "@/i18n/Messages";
import {
  NewsCategory,
  NewsItem,
  NewsSourceKind,
  SupportedLocale,
} from "@f1/domain";
import {
  Facebook,
  Instagram,
  Newspaper,
  Youtube,
  type LucideIcon,
} from "lucide-react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  item: NewsItem;
};

// 소스 종류별 아이콘. 큐레이션 소셜(IG/FB)도 화면 표기용으로 아이콘을 둔다.
const KIND_ICON: Record<NewsSourceKind, LucideIcon> = {
  [NewsSourceKind.Article]: Newspaper,
  [NewsSourceKind.YouTube]: Youtube,
  [NewsSourceKind.Instagram]: Instagram,
  [NewsSourceKind.Facebook]: Facebook,
};

// 카테고리별 배지 톤. 순위 행·상태 배지와 같은 절제된 팔레트.
const CATEGORY_CLASS: Record<NewsCategory, string> = {
  [NewsCategory.Result]: "bg-emerald-400/15 text-emerald-300",
  [NewsCategory.Rule]: "bg-amber-400/15 text-amber-300",
  [NewsCategory.TeamUpdate]: "bg-sky-400/15 text-sky-300",
  [NewsCategory.General]: "bg-white/10 text-muted-foreground",
};

// 뉴스 카드 한 장 (docs/28-news-tab.md §UX).
//
// 카드 전체가 외부 원문으로 가는 링크다 — 앱 링크 안전 규칙대로 새 탭/브라우저로 열고
// (target=_blank + noopener), 본문 전문이 아니라 제목 + 발췌 + 출처만 보여 준다(저작권).
export const NewsCardView = ({ dictionary, locale, item }: Props) => {
  const texts = dictionary.news;
  const KindIcon = KIND_ICON[item.kind];

  const publishedLabel = new Date(item.publishedAt).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="glass-float press flex flex-col gap-2 rounded-2xl p-3.5 transition-colors hover:bg-white/[0.04]"
    >
      <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        <KindIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{item.sourceName}</span>

        <span
          className={`ml-auto rounded-full px-2 py-0.5 font-semibold ${CATEGORY_CLASS[item.category]}`}
        >
          {texts.category[item.category]}
        </span>
      </div>

      <h3 className="text-sm font-bold leading-snug tracking-tight text-foreground">
        {item.title}
      </h3>

      {item.summary === null ? null : (
        <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
          {item.summary}
        </p>
      )}

      <time
        dateTime={item.publishedAt}
        className="text-[11px] tabular-nums text-muted-foreground/70"
      >
        {publishedLabel}
      </time>
    </a>
  );
};
