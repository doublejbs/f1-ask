"use client";

import { useCallback, useEffect, useState } from "react";

// 응원 팀 + 온보딩 완료 플래그 (docs 계획 §Phase 1).
//
// 응원 팀은 기기 로컬 단일 값이다 — 온보딩에서 고른 드라이버(별)는 기존 즐겨찾기 경로로
// Firestore 에 동기화되지만, 팀 선호는 대문 표시용이라 로컬로 충분하다(로그인 불필요).
const TEAM_KEY = "racepilot:favorite-team:v1";
const ONBOARDED_KEY = "racepilot:onboarded:v1";

const readTeam = (): string | null => {
  try {
    const value = window.localStorage.getItem(TEAM_KEY);
    return value !== null && value.length > 0 ? value : null;
  } catch {
    return null;
  }
};

const writeTeam = (team: string | null): void => {
  try {
    if (team === null) {
      window.localStorage.removeItem(TEAM_KEY);
    } else {
      window.localStorage.setItem(TEAM_KEY, team);
    }
  } catch {
    // in-memory 상태만 유지한다.
  }
};

const readOnboarded = (): boolean => {
  try {
    return window.localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return false;
  }
};

const writeOnboarded = (): void => {
  try {
    window.localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    // 무시 — 다음 실행에 온보딩이 다시 뜰 수 있으나 치명적이지 않다.
  }
};

export type FavoriteTeamController = {
  favoriteTeam: string | null;
  setFavoriteTeam: (team: string | null) => void;
  // 온보딩을 이미 마쳤는가(팀을 골랐든 건너뛰었든).
  hasOnboarded: boolean;
  markOnboarded: () => void;
  // localStorage 를 읽기 전(SSR·첫 페인트)에는 false — 온보딩 게이트가 깜빡이지 않게 한다.
  isLoaded: boolean;
};

export const useFavoriteTeam = (): FavoriteTeamController => {
  const [favoriteTeam, setTeam] = useState<string | null>(null);
  const [hasOnboarded, setOnboarded] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setTeam(readTeam());
    setOnboarded(readOnboarded());
    setIsLoaded(true);
  }, []);

  const setFavoriteTeam = useCallback((team: string | null) => {
    setTeam(team);
    writeTeam(team);
  }, []);

  const markOnboarded = useCallback(() => {
    setOnboarded(true);
    writeOnboarded();
  }, []);

  return {
    favoriteTeam,
    setFavoriteTeam,
    hasOnboarded,
    markOnboarded,
    isLoaded,
  };
};
