import { firestorePaths, RaceEvent } from "@f1/domain";
import { getServerFirestore } from "@/firebase/ServerFirestore";

// 서버 전용 이벤트 fetcher (docs/26 §서버측 Firestore).
//
// 툴(queryDriverEvents)이 전체 이력을 in-memory 로 필터하므로, Firestore 에서는
// `sessions/{sessionId}/events` 컬렉션을 **한 번에 통째로** 읽으면 된다.
//
// **복합 인덱스 불필요**: driverNumber+type+lapNumber 범위로 Firestore 를 직접 쿼리하지 않고,
// 컬렉션 전체를 읽어 queryDriverEvents 가 메모리에서 필터한다. 그래서 스펙(수용 기준 §14)이
// 걱정했던 driverNumber+type 복합 인덱스(firestore.indexes.json 배포)가 이 경로에는 필요 없다.
// 정렬·상한(limit)도 queryDriverEvents 몫이라 여기서는 raw 로 넘긴다.
export const fetchSessionEvents = async (
  sessionId: string,
): Promise<RaceEvent[]> => {
  // sessionId 스키마가 z.string().min(1) 이라 슬래시가 통과할 수 있다. 경로 주입 방어.
  if (sessionId.includes("/") || sessionId.includes("\\")) {
    return [];
  }

  const db = getServerFirestore();
  const snapshot = await db.collection(firestorePaths.events(sessionId)).get();

  // 워커(FirestoreWorkerStore.writeEvents)가 RaceEvent 를 통째로 저장하므로 문서 데이터가
  // 곧 RaceEvent 다 — 여기서 재매핑 없이 그대로 캐스팅한다.
  return snapshot.docs.map((doc) => doc.data() as RaceEvent);
};
