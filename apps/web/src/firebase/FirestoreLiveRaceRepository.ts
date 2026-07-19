import { getFirestoreDb } from "@/firebase/Client";
import {
  firestorePaths,
  LIVE_CURRENT_DOC_ID,
  LiveRaceReadRepository,
  LiveRaceSnapshot,
  RaceEvent,
  Unsubscribe,
} from "@f1/domain";
import { parseLiveRaceSnapshot, parseRaceEvent } from "@f1/schemas";
import {
  collection,
  doc,
  limit as limitTo,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

// Firestore 클라이언트 읽기 repository 구현 (docs §20).
// 공개 경기 데이터를 실시간 구독한다. 문서는 경계에서 runtime schema 검증한다.
export class FirestoreLiveRaceRepository implements LiveRaceReadRepository {
  subscribeSnapshot(
    sessionId: string,
    onChange: (snapshot: LiveRaceSnapshot | null) => void,
  ): Unsubscribe {
    const reference = doc(
      getFirestoreDb(),
      firestorePaths.session(sessionId),
      "live",
      LIVE_CURRENT_DOC_ID,
    );

    return onSnapshot(reference, (docSnapshot) => {
      if (!docSnapshot.exists()) {
        onChange(null);
        return;
      }

      const parsed = parseLiveRaceSnapshot(docSnapshot.data());

      onChange(parsed);
    });
  }

  subscribeEvents(
    sessionId: string,
    limit: number,
    onChange: (events: RaceEvent[]) => void,
  ): Unsubscribe {
    const eventsQuery = query(
      collection(getFirestoreDb(), firestorePaths.events(sessionId)),
      orderBy("timestamp", "desc"),
      limitTo(limit),
    );

    return onSnapshot(eventsQuery, (querySnapshot) => {
      const events: RaceEvent[] = [];

      for (const document of querySnapshot.docs) {
        events.push(parseRaceEvent(document.data()));
      }

      // 오름차순(오래된 것 먼저)으로 되돌려 다른 소스와 정렬 규칙을 맞춘다.
      onChange(events.reverse());
    });
  }
}
