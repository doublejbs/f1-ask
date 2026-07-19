"use client";

import {
  DEFAULT_EXPLANATION_LEVEL,
  ExplanationLevel,
  isExplanationLevel,
} from "@f1/domain";
import { useCallback, useEffect, useState } from "react";

// 비로그인 사용자의 설명 수준은 localStorage 에 저장한다.
// (docs/03-firestore-and-auth.md §12) 저장 실패는 non-fatal 로 처리한다.
const STORAGE_KEY = "f1-second-screen:explanation-level:v1";

const readLevel = (): ExplanationLevel => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw !== null && isExplanationLevel(raw)) {
      return raw;
    }
  } catch {
    // 접근 실패 시 기본값 사용.
  }

  return DEFAULT_EXPLANATION_LEVEL;
};

const writeLevel = (level: ExplanationLevel): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // in-memory 상태만 유지한다.
  }
};

export type ExplanationLevelController = {
  level: ExplanationLevel;
  setLevel: (level: ExplanationLevel) => void;
};

export const useExplanationLevel = (): ExplanationLevelController => {
  const [level, setLevelState] = useState<ExplanationLevel>(
    DEFAULT_EXPLANATION_LEVEL,
  );

  useEffect(() => {
    setLevelState(readLevel());
  }, []);

  const setLevel = useCallback((next: ExplanationLevel) => {
    setLevelState(next);
    writeLevel(next);
  }, []);

  return { level, setLevel };
};
