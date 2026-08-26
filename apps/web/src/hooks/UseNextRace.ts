"use client";

import { NextRace } from "@f1/domain";
import { useEffect, useState } from "react";

export type NextRaceLoadState = {
  nextRace: NextRace | null;
  isLoading: boolean;
  isError: boolean;
};

// 다음 결승 로드 훅. `enabled`(라이브 세션 없을 때만) 일 때 /api/schedule/next 를 가져온다.
export const useNextRace = (enabled: boolean): NextRaceLoadState => {
  const [state, setState] = useState<NextRaceLoadState>({
    nextRace: null,
    isLoading: true,
    isError: false,
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    fetch("/api/schedule/next")
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("bad status")),
      )
      .then((data: unknown) => {
        if (cancelled) {
          return;
        }

        const nextRace = (data as { nextRace?: NextRace | null })?.nextRace ?? null;
        setState({ nextRace, isLoading: false, isError: false });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ nextRace: null, isLoading: false, isError: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
};
