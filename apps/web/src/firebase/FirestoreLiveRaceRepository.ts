import { getFirestoreDb } from "@/firebase/Client";
import {
  buildEventQueryPlan,
  firestorePaths,
  LIVE_CURRENT_DOC_ID,
  LiveRaceReadRepository,
  LiveRaceSnapshot,
  RaceEvent,
  RaceEventPriority,
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
  where,
  type QueryConstraint,
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

  // priorities 를 주면 where("priority","in",...) 를 붙인다. Firestore `in` 은
  // 최대 30 개 값까지 허용되므로 우선순위 2 개는 문제없다.
  // 이 조합은 복합 인덱스(priority ASC + timestamp DESC)가 필요하다 —
  // firestore.indexes.json 참고. 에뮬레이터는 인덱스 없이도 동작한다.
  subscribeEvents(
    sessionId: string,
    limit: number,
    onChange: (events: RaceEvent[]) => void,
    priorities?: RaceEventPriority[],
  ): Unsubscribe {
    const plan = buildEventQueryPlan(sessionId, limit, priorities);
    const constraints: QueryConstraint[] = [];

    if (plan.priorities !== null) {
      constraints.push(where("priority", "in", plan.priorities));
    }

    constraints.push(
      orderBy(plan.orderByField, plan.isDescending ? "desc" : "asc"),
      limitTo(plan.limit),
    );

    const eventsQuery = query(
      collection(getFirestoreDb(), plan.collectionPath),
      ...constraints,
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
