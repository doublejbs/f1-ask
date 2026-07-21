"use client";

import {
  addFavoriteDriver,
  addFavoriteDrivers,
  removeFavoriteDriver,
  subscribeFavoriteDrivers,
  type FavoriteDriverUnsubscribe,
} from "@/firebase/FavoriteDriverStore";
import {
  diffFavoriteDrivers,
  mergeFavoriteDrivers,
  normalizeFavoriteDrivers,
} from "@f1/domain";
import { useCallback, useEffect, useRef, useState } from "react";

// 관심 드라이버 저장소 (docs/15-google-auth.md §저장소 전환).
// - 비로그인: localStorage
// - 로그인: users/{uid}/favoriteDrivers (Firestore)
// 로그인해도 로컬 사본은 지우지 않고 계속 미러링한다 — 로그아웃하면 곧바로
// 로컬 모드로 되돌아가야 하고, Firestore 가 실패해도 폴백할 곳이 남아야 한다.
const STORAGE_KEY = "f1-second-screen:favorite-drivers:v1";

const readLocalFavorites = (): number[] => {
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
    return normalizeFavoriteDrivers(parsed);
  } catch {
    return [];
  }
};

const writeLocalFavorites = (values: readonly number[]): void => {
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

// uid 가 null 이면 로컬 모드다(비로그인 또는 인증 로딩 중).
export const useFavoriteDrivers = (
  uid: string | null,
): FavoriteDriversController => {
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  // 이번 로그인 세션에서 로컬↔서버 병합을 이미 끝냈는지.
  const hasMergedRef = useRef(false);

  useEffect(() => {
    // 로컬 모드. 로그아웃 직후에도 로컬 사본이 그대로 남아 있어 즉시 복귀한다.
    if (uid === null) {
      hasMergedRef.current = false;
      setFavorites(new Set(readLocalFavorites()));

      return;
    }

    hasMergedRef.current = false;

    // Firestore 실패는 조용히 로컬 폴백한다 — 경기 데이터는 인증과 무관하다.
    const handleFailure = (error: unknown): void => {
      console.warn("[favorites] Firestore 즐겨찾기 동기화 실패", error);
      setFavorites(new Set(readLocalFavorites()));
    };

    // 로그인 직후에는 상태를 비우지 않는다 — 병합 전까지 로컬 값을 낙관적으로 보여준다.
    let unsubscribe: FavoriteDriverUnsubscribe | null = null;

    try {
      unsubscribe = subscribeFavoriteDrivers(
        uid,
        (remote) => {
          if (!hasMergedRef.current) {
            hasMergedRef.current = true;

            const merged = mergeFavoriteDrivers(readLocalFavorites(), remote);
            const { added } = diffFavoriteDrivers(remote, merged);

            setFavorites(new Set(merged));
            writeLocalFavorites(merged);

            // 서버에 없던 로컬 값만 올린다.
            if (added.length > 0) {
              void addFavoriteDrivers(uid, added).catch(handleFailure);
            }

            return;
          }

          // 병합 이후에는 서버가 진실이다(다른 기기의 해제도 반영된다).
          setFavorites(new Set(remote));
          writeLocalFavorites(remote);
        },
        handleFailure,
      );
    } catch (error) {
      handleFailure(error);
    }

    return () => {
      unsubscribe?.();
    };
  }, [uid]);

  const toggleFavorite = useCallback(
    (driverNumber: number) => {
      const willAdd = !favorites.has(driverNumber);
      const next = new Set(favorites);

      if (willAdd) {
        next.add(driverNumber);
      } else {
        next.delete(driverNumber);
      }

      // 낙관적 반영 + 로컬 미러링.
      setFavorites(next);
      writeLocalFavorites(Array.from(next));

      if (uid === null) {
        return;
      }

      const write = willAdd
        ? addFavoriteDriver(uid, driverNumber)
        : removeFavoriteDriver(uid, driverNumber);

      void write.catch((error: unknown) => {
        // 쓰기 실패 시에도 로컬 값은 이미 저장돼 있어 사용자는 흐름을 잃지 않는다.
        console.warn("[favorites] Firestore 즐겨찾기 쓰기 실패", error);
      });
    },
    [favorites, uid],
  );

  const isFavorite = useCallback(
    (driverNumber: number) => favorites.has(driverNumber),
    [favorites],
  );

  return { favorites, isFavorite, toggleFavorite };
};
