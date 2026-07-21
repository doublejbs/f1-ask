"use client";

import { AuthStatus } from "@/firebase/AuthStatus";
import { getFirebaseAuth } from "@/firebase/Client";
import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as signOutFromFirebase,
  type Auth,
  type User,
} from "firebase/auth";
import { useCallback, useEffect, useState } from "react";

// 구글 로그인 (docs/15-google-auth.md).
// 원칙: 로그인은 선택이다. 인증이 실패해도 앱은 비로그인 모드로 계속 동작한다 —
// 이 훅은 절대 throw 하지 않고 모든 실패를 상태로만 표현한다.

// 팝업이 막혔거나 환경이 팝업을 못 쓰는 경우 → 리다이렉트로 폴백한다.
const REDIRECT_FALLBACK_ERROR_CODES = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
]);

// 사용자가 직접 취소한 경우 → 오류가 아니다. 조용히 아무것도 하지 않는다.
const SILENT_ERROR_CODES = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
]);

export type AuthUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoUrl: string | null;
};

export type FirebaseAuthController = {
  status: AuthStatus;
  user: AuthUser | null;
  // Firebase 설정이 없으면(mock 전용 배포 등) 계정 UI 자체를 숨긴다.
  isAvailable: boolean;
  hasSignInError: boolean;
  isSigningIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const toAuthUser = (user: User): AuthUser => ({
  uid: user.uid,
  displayName: user.displayName,
  email: user.email,
  photoUrl: user.photoURL,
});

// Firebase 공개 설정이 없으면 getFirebaseAuth 가 throw 한다. 앱을 멈추지 않는다.
const readAuthOrNull = (): Auth | null => {
  try {
    return getFirebaseAuth();
  } catch (error) {
    console.warn("[auth] Firebase Auth 를 초기화하지 못했다", error);

    return null;
  }
};

const readErrorCode = (error: unknown): string | null => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error as { code: unknown };

    return typeof code === "string" ? code : null;
  }

  return null;
};

export const useFirebaseAuth = (): FirebaseAuthController => {
  const [status, setStatus] = useState<AuthStatus>(AuthStatus.Loading);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [hasSignInError, setHasSignInError] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    const auth = readAuthOrNull();

    if (auth === null) {
      setIsAvailable(false);
      setStatus(AuthStatus.SignedOut);

      return;
    }

    // 리다이렉트 폴백으로 돌아온 경우의 결과를 소비한다.
    // 성공 시 사용자 반영은 onAuthStateChanged 가 맡는다.
    void getRedirectResult(auth).catch((error: unknown) => {
      console.warn("[auth] 리다이렉트 로그인 결과 처리 실패", error);
      setHasSignInError(true);
    });

    const unsubscribe = onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser === null ? null : toAuthUser(nextUser));
        setStatus(
          nextUser === null ? AuthStatus.SignedOut : AuthStatus.SignedIn,
        );
        setIsSigningIn(false);
      },
      (error) => {
        console.warn("[auth] 인증 상태 구독 실패", error);
        setUser(null);
        setStatus(AuthStatus.SignedOut);
        setIsSigningIn(false);
      },
    );

    return unsubscribe;
  }, []);

  const signIn = useCallback(async () => {
    const auth = readAuthOrNull();

    if (auth === null) {
      setHasSignInError(true);

      return;
    }

    setHasSignInError(false);
    setIsSigningIn(true);

    const provider = new GoogleAuthProvider();

    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      const code = readErrorCode(error);

      if (code !== null && SILENT_ERROR_CODES.has(code)) {
        setIsSigningIn(false);

        return;
      }

      if (code !== null && REDIRECT_FALLBACK_ERROR_CODES.has(code)) {
        try {
          // 페이지가 떠난다. 돌아오면 getRedirectResult 가 이어받는다.
          await signInWithRedirect(auth, provider);

          return;
        } catch (redirectError) {
          console.warn("[auth] 리다이렉트 로그인 폴백 실패", redirectError);
        }
      }

      console.warn("[auth] 구글 로그인 실패", error);
      setHasSignInError(true);
      setIsSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    const auth = readAuthOrNull();

    if (auth === null) {
      return;
    }

    setHasSignInError(false);

    try {
      await signOutFromFirebase(auth);
    } catch (error) {
      // 로그아웃 실패도 앱을 멈추지 않는다.
      console.warn("[auth] 로그아웃 실패", error);
    }
  }, []);

  return {
    status,
    user,
    isAvailable,
    hasSignInError,
    isSigningIn,
    signIn,
    signOut,
  };
};
