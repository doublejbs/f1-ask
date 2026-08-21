"use client";

import { MockNewsSource, NewsItem } from "@f1/domain";
import { useEffect, useState } from "react";

export type NewsLoadState = {
  items: NewsItem[];
  isLoading: boolean;
  isError: boolean;
};

// 뉴스 로드 훅 (docs/28-news-tab.md).
//
// 지금은 MockNewsSource 로 오프라인에서 동작한다. 라이브(RSS·YouTube)는 같은 NewsSource
// 인터페이스를 구현하는 서버 경로로 교체하며(키는 서버에만), 이 훅의 소비자는 바뀌지 않는다.
export const useNews = (): NewsLoadState => {
  const [state, setState] = useState<NewsLoadState>({
    items: [],
    isLoading: true,
    isError: false,
  });

  useEffect(() => {
    let cancelled = false;
    const source = new MockNewsSource();

    source
      .load()
      .then((items) => {
        if (!cancelled) {
          setState({ items, isLoading: false, isError: false });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ items: [], isLoading: false, isError: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
};
