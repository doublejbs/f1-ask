"use client";

import { useCallback, useEffect, useState } from "react";

// 비로그인 사용자의 관심 드라이버는 localStorage 에 저장한다.
// (docs/03-firestore-and-auth.md §12) 저장 실패는 non-fatal 로 처리한다.
const STORAGE_KEY = "f1-second-screen:favorite-drivers:v1";

const readFavorites = (): number[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw === null) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    // 유효한 driver number 만 허용한다.
    return parsed.filter(
      (value): value is number =>
        typeof value === "number" && Number.isInteger(value) && value > 0,
    );
  } catch {
    return [];
  }
};

const writeFavorites = (values: number[]): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // in-memory 상태만 유지한다. 앱 전체 오류로 이어지지 않게 한다.
  }
};

export type FavoriteDriversController = {
  favorites: Set<number>;
  isFavorite: (driverNumber: number) => boolean;
  toggleFavorite: (driverNumber: number) => void;
};

export const useFavoriteDrivers = (): FavoriteDriversController => {
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

  useEffect(() => {
    setFavorites(new Set(readFavorites()));
  }, []);

  const toggleFavorite = useCallback((driverNumber: number) => {
    setFavorites((current) => {
      const next = new Set(current);

      if (next.has(driverNumber)) {
        next.delete(driverNumber);
      } else {
        next.add(driverNumber);
      }

      writeFavorites(Array.from(next));

      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (driverNumber: number) => favorites.has(driverNumber),
    [favorites],
  );

  return { favorites, isFavorite, toggleFavorite };
};
