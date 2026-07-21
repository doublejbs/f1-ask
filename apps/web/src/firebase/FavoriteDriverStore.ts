import { getFirestoreDb } from "@/firebase/Client";
import {
  favoriteDriverPaths,
  normalizeFavoriteDrivers,
  parseFavoriteDriverDocId,
  toFavoriteDriverDocId,
} from "@f1/domain";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

// users/{uid}/favoriteDrivers 접근 경계.
// 문서 id = 드라이버 번호(docs/15-google-auth.md 구현 판단) — 토글 하나가 문서 하나의
// 쓰기라 두 기기가 서로 다른 드라이버를 동시에 토글해도 서로를 덮어쓰지 않는다.

export type FavoriteDriverUnsubscribe = () => void;

// 문서 데이터는 id 만으로 충분하지만, 콘솔에서 읽을 수 있도록 필드도 함께 남긴다.
const buildFavoriteDoc = (driverNumber: number) => ({
  driverNumber,
  createdAt: serverTimestamp(),
});

export const subscribeFavoriteDrivers = (
  uid: string,
  onChange: (driverNumbers: number[]) => void,
  onFailure: (error: unknown) => void,
): FavoriteDriverUnsubscribe => {
  const collectionRef = collection(
    getFirestoreDb(),
    favoriteDriverPaths.collection(uid),
  );

  return onSnapshot(
    collectionRef,
    (snapshot) => {
      const driverNumbers = snapshot.docs.map((document) =>
        parseFavoriteDriverDocId(document.id),
      );

      onChange(normalizeFavoriteDrivers(driverNumbers));
    },
    onFailure,
  );
};

export const addFavoriteDriver = async (
  uid: string,
  driverNumber: number,
): Promise<void> => {
  const documentRef = doc(
    getFirestoreDb(),
    favoriteDriverPaths.collection(uid),
    toFavoriteDriverDocId(driverNumber),
  );

  await setDoc(documentRef, buildFavoriteDoc(driverNumber));
};

export const removeFavoriteDriver = async (
  uid: string,
  driverNumber: number,
): Promise<void> => {
  const documentRef = doc(
    getFirestoreDb(),
    favoriteDriverPaths.collection(uid),
    toFavoriteDriverDocId(driverNumber),
  );

  await deleteDoc(documentRef);
};

// 로그인 병합 업로드. 서버에 없는 값만 올린다(diffFavoriteDrivers 로 걸러 넘긴다).
export const addFavoriteDrivers = async (
  uid: string,
  driverNumbers: readonly number[],
): Promise<void> => {
  await Promise.all(
    driverNumbers.map((driverNumber) => addFavoriteDriver(uid, driverNumber)),
  );
};
