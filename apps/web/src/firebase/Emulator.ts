import { getAppEnv } from "@/lib/Env";
import { type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

// Emulator 연결 구조 (docs/03-firestore-and-auth.md §27).
// development 에서 NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true 일 때만 연결한다.
const AUTH_EMULATOR_PORT = 9099;
const FIRESTORE_EMULATOR_PORT = 8080;

let connected = false;

export const connectEmulatorsIfEnabled = (app: FirebaseApp): void => {
  if (connected) {
    return;
  }

  const env = getAppEnv();

  if (!env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR) {
    return;
  }

  const host = env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST;

  connectAuthEmulator(getAuth(app), `http://${host}:${AUTH_EMULATOR_PORT}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(getFirestore(app), host, FIRESTORE_EMULATOR_PORT);

  connected = true;
};
