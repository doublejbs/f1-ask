// 관심 드라이버 저장소 동기화 규칙 (docs/15-google-auth.md §로그인 시 병합).
// 순수 로직만 담는다 — Firestore SDK 는 웹 앱 계층에서만 다룬다.

// Firestore 경로. 규칙(firestore.rules)이 users/{uid}/favoriteDrivers/{favoriteId} 를
// isOwner(uid) 로 보호한다.
export const favoriteDriverPaths = {
  collection: (uid: string): string => `users/${uid}/favoriteDrivers`,
  doc: (uid: string, driverNumber: number): string =>
    `users/${uid}/favoriteDrivers/${driverNumber}`,
};

// 드라이버 번호는 양의 정수다. 저장소에서 읽은 값은 신뢰하지 않고 항상 검증한다.
export const isFavoriteDriverNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

// 드라이버 번호를 문서 id 로 쓴다 — 같은 드라이버가 두 문서로 갈라지지 않는다.
export const toFavoriteDriverDocId = (driverNumber: number): string =>
  String(driverNumber);

// 문서 id 를 드라이버 번호로 되돌린다. 유효하지 않으면 null.
export const parseFavoriteDriverDocId = (docId: string): number | null => {
  if (!/^[1-9][0-9]*$/.test(docId)) {
    return null;
  }

  const parsed = Number(docId);

  return isFavoriteDriverNumber(parsed) ? parsed : null;
};

// 유효한 값만 남기고 중복을 제거해 오름차순으로 정규화한다.
export const normalizeFavoriteDrivers = (values: readonly unknown[]): number[] => {
  const valid = values.filter(isFavoriteDriverNumber);

  return Array.from(new Set(valid)).sort((left, right) => left - right);
};

// 로컬 ∪ 서버. 즐겨찾기는 순서 없는 집합이라 합집합이 안전하다 —
// 어느 한쪽을 버리면 "내가 별 찍은 게 사라졌다"가 된다.
export const mergeFavoriteDrivers = (
  local: readonly unknown[],
  remote: readonly unknown[],
): number[] => normalizeFavoriteDrivers([...local, ...remote]);

export type FavoriteDriverDiff = {
  added: number[];
  removed: number[];
};

// current → next 로 가기 위해 필요한 최소 변경. 병합 업로드 시 이미 서버에 있는
// 문서를 다시 쓰지 않기 위해 쓴다(불필요한 Firestore 쓰기를 만들지 않는다).
export const diffFavoriteDrivers = (
  current: readonly unknown[],
  next: readonly unknown[],
): FavoriteDriverDiff => {
  const currentSet = new Set(normalizeFavoriteDrivers(current));
  const nextSet = new Set(normalizeFavoriteDrivers(next));

  return {
    added: Array.from(nextSet).filter((value) => !currentSet.has(value)),
    removed: Array.from(currentSet).filter((value) => !nextSet.has(value)),
  };
};
