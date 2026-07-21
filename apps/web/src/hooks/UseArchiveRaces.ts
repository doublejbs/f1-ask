"use client";

import { ArchiveRaceListItem } from "@f1/domain";
import { parseArchiveRaceListResponse } from "@f1/schemas";
import { useCallback, useEffect, useState } from "react";

export type ArchiveRacesState = {
  races: ArchiveRaceListItem[];
  isLoading: boolean;
  // OpenF1 조회 실패가 앱을 멈추지 않도록 목록은 자기 오류 상태를 갖는다.
  hasError: boolean;
  retry: () => void;
};

// 완료 레이스 목록. 탭을 처음 열 때만 조회하고(enabled) 이후에는 캐시된 응답을 쓴다.
export const useArchiveRaces = (enabled: boolean): ArchiveRacesState => {
  const [races, setRaces] = useState<ArchiveRaceListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);

  const retry = useCallback(() => {
    setHasLoaded(false);
    setAttempt((previous) => previous + 1);
  }, []);

  useEffect(() => {
    if (!enabled || hasLoaded) {
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setHasError(false);

    void (async () => {
      try {
        const response = await fetch("/api/archive/races");

        if (!response.ok) {
          throw new Error(`archive list failed: ${response.status}`);
        }

        const parsed = parseArchiveRaceListResponse(await response.json());

        if (cancelled) {
          return;
        }

        setRaces(parsed.races);
        setHasLoaded(true);
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
  }, [enabled, hasLoaded, attempt]);

  return { races, isLoading, hasError, retry };
};
