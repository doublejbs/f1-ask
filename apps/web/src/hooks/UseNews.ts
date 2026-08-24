"use client";

import { MockNewsSource, NewsItem } from "@f1/domain";
import { useEffect, useState } from "react";

export type NewsLoadState = {
  items: NewsItem[];
  isLoading: boolean;
  isError: boolean;
};

// 클라이언트가 읽는 최소 형태 검증. 서버(/api/news)가 우리 코드지만, 배포 스큐·빈 응답이
// 화면을 깨지 않게 배열과 필수 필드만 확인한다.
const isNewsItem = (value: unknown): value is NewsItem => {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.url === "string" &&
    typeof candidate.publishedAt === "string"
  );
};

// 뉴스 로드 훅 (docs/28-news-tab.md).
//
// 실제 F1 RSS/Atom 을 서버 라우트(/api/news)에서 가져온다. 실패하거나 결과가 비면 오프라인용
// MockNewsSource 로 폴백해 탭이 절대 비지 않게 한다(개발·피드 장애 시).
export const useNews = (): NewsLoadState => {
  const [state, setState] = useState<NewsLoadState>({
    items: [],
    isLoading: true,
    isError: false,
  });

  useEffect(() => {
    let cancelled = false;

    const applyMockFallback = async () => {
      try {
        const items = await new MockNewsSource().load();

        if (!cancelled) {
          setState({ items, isLoading: false, isError: false });
        }
      } catch {
        if (!cancelled) {
          setState({ items: [], isLoading: false, isError: true });
        }
      }
    };

    fetch("/api/news")
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("bad status")),
      )
      .then((data: unknown) => {
        if (cancelled) {
          return;
        }

        const raw = (data as { items?: unknown })?.items;
        const items = Array.isArray(raw) ? raw.filter(isNewsItem) : [];

        if (items.length === 0) {
          void applyMockFallback();
          return;
        }

        setState({ items, isLoading: false, isError: false });
      })
      .catch(() => {
        if (!cancelled) {
          void applyMockFallback();
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
};
