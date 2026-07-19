import { parsePublicFirebaseEnv } from "@f1/schemas";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { connectEmulatorsIfEnabled } from "./Emulator";

// Firebase Client SDK 초기화 (docs/03-firestore-and-auth.md §4).
// - browser-only 경계: Admin SDK 는 절대 이 번들에 포함하지 않는다.
// - Mock 모드에서는 호출되지 않으므로 Firebase 설정이 없어도 앱이 동작한다.
// - 실제 초기화 시점에만 공개 설정을 엄격히 검증한다.

let appInstance: FirebaseApp | null = null;

const firebaseConfigFromEnv = () => {
  const env = parsePublicFirebaseEnv({
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });

  return {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
};

// Hot reload / React Strict Mode 에서 중복 초기화되지 않는 싱글턴.
export const getFirebaseApp = (): FirebaseApp => {
  if (appInstance !== null) {
    return appInstance;
  }

  appInstance =
    getApps().length > 0 ? getApp() : initializeApp(firebaseConfigFromEnv());

  connectEmulatorsIfEnabled(appInstance);

  return appInstance;
};

export const getFirebaseAuth = (): Auth => getAuth(getFirebaseApp());

export const getFirestoreDb = (): Firestore => getFirestore(getFirebaseApp());
