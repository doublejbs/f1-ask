"use client";

import { WeekendResults } from "@f1/domain";
import { parseWeekendResults } from "@f1/schemas";
import { useEffect, useState } from "react";

export type WeekendResultsState = {
  results: WeekendResults | null;
  isLoading: boolean;
  hasError: boolean;
};

// 주말 프랙티스·퀄리 결과 (docs/27, E1). meetingKey 가 null 이면 조회하지 않는다.
export const useWeekendResults = (
  meetingKey: number | null,
): WeekendResultsState => {
  const [results, setResults] = useState<WeekendResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (meetingKey === null) {
      setResults(null);
      setHasError(false);

      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setHasError(false);
    setResults(null);

    void (async () => {
      try {
        const response = await fetch(
          `/api/archive/weekend/${meetingKey}/results`,
        );

        if (!response.ok) {
          throw new Error(`weekend results failed: ${response.status}`);
        }

        const parsed = parseWeekendResults(await response.json());

        if (!cancelled) {
          setResults(parsed);
        }
      } catch {
        if (!cancelled) {
          setHasError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [meetingKey]);

  return { results, isLoading, hasError };
};
