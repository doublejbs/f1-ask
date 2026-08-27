"use client";

import { TeammateVs } from "@f1/domain";
import { useEffect, useState } from "react";

export type TeammateVsLoadState = {
  vs: TeammateVs | null;
  isLoading: boolean;
};

// 응원 팀의 팀메이트 VS 데이터를 가져온다. teamName 이 없으면 요청하지 않는다.
export const useTeammateVs = (teamName: string | null): TeammateVsLoadState => {
  const [state, setState] = useState<TeammateVsLoadState>({
    vs: null,
    isLoading: teamName !== null,
  });

  useEffect(() => {
    if (teamName === null) {
      setState({ vs: null, isLoading: false });
      return;
    }

    let cancelled = false;
    setState({ vs: null, isLoading: true });

    fetch(`/api/season/teammates?team=${encodeURIComponent(teamName)}`)
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("bad status")),
      )
      .then((data: unknown) => {
        if (cancelled) {
          return;
        }

        const vs = (data as { vs?: TeammateVs | null })?.vs ?? null;
        setState({ vs, isLoading: false });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ vs: null, isLoading: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [teamName]);

  return state;
};
