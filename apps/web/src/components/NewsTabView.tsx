"use client";

import { NewsCardView } from "@/components/NewsCardView";
import { useNews } from "@/hooks/UseNews";
import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import {
  NEWS_FILTERS,
  NewsFilter,
  selectNewsFeed,
  SupportedLocale,
} from "@f1/domain";
import { useMemo, useState } from "react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
};

// 「뉴스」 탭 — 경기 전후 소식 (docs/28-news-tab.md).
//
// 상단 필터 칩(전체/결과/규정/팀/영상/소셜) + 카드 목록. 중복 제거·정렬·필터는 도메인
// 셀렉터가 하고 이 뷰는 그리기만 한다. 지금은 Mock 소스라 오프라인에서 동작한다.
export const NewsTabView = ({ dictionary, locale }: Props) => {
  const texts = dictionary.news;
  const { items, isLoading, isError } = useNews();
  const [filter, setFilter] = useState<NewsFilter>(NewsFilter.All);

  const visible = useMemo(
    () => selectNewsFeed(items, filter),
    [items, filter],
  );

  return (
    <section aria-label={texts.title} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{texts.title}</h1>
        <p className="text-sm text-muted-foreground">{texts.subtitle}</p>
      </div>

      {/* 필터 칩 — 가로 스크롤 가능한 한 줄. 44pt 터치 타깃. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {NEWS_FILTERS.map((option) => {
          const isActive = option === filter;

          return (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              aria-pressed={isActive}
              className={cn(
                "press min-h-[2rem] shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                isActive
                  ? "bg-white/[0.16] text-foreground"
                  : "bg-white/[0.05] text-muted-foreground hover:text-foreground",
              )}
            >
              {texts.filter[option]}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <p className="animate-pulse py-12 text-sm text-muted-foreground">
          {texts.loading}
        </p>
      ) : isError ? (
        <p className="py-12 text-sm text-muted-foreground">{texts.error}</p>
      ) : visible.length === 0 ? (
        <p className="py-12 text-sm text-muted-foreground">{texts.empty}</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((item) => (
            <NewsCardView
              key={item.id}
              dictionary={dictionary}
              locale={locale}
              item={item}
            />
          ))}
        </div>
      )}
    </section>
  );
};
