"use client";

import { RosterTeam } from "@f1/domain";
import { useEffect, useState } from "react";

export type RosterLoadState = {
  teams: RosterTeam[];
  isLoading: boolean;
  isError: boolean;
};

// 팀 로스터 로드 훅. `enabled` 일 때만 가져온다 — 온보딩이 실제로 열릴 때만 /api/roster 를 친다.
export const useRoster = (enabled: boolean): RosterLoadState => {
  const [state, setState] = useState<RosterLoadState>({
    teams: [],
    isLoading: true,
    isError: false,
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    fetch("/api/roster")
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("bad status")),
      )
      .then((data: unknown) => {
        if (cancelled) {
          return;
        }

        const raw = (data as { teams?: unknown })?.teams;
        const teams = Array.isArray(raw) ? (raw as RosterTeam[]) : [];
        setState({ teams, isLoading: false, isError: false });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ teams: [], isLoading: false, isError: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
};
