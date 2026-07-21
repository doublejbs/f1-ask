import { getFirestoreDb } from "@/firebase/Client";
import {
  AiCommentary,
  buildCommentaryQueryPlan,
  CommentaryReadRepository,
  ExplanationLevel,
  SupportedLocale,
  toAiCommentaryFromDocument,
  Unsubscribe,
} from "@f1/domain";
import { parseCommentaryDocument } from "@f1/schemas";
import {
  collection,
  limit as limitTo,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

// 워커가 쓴 AI 해설의 클라이언트 읽기 repository (docs/18-ai-commentary-worker.md).
// 이벤트 구독(FirestoreLiveRaceRepository)과 같은 형태로 맞춰, 화면은 해설이
// 어디서 왔는지 몰라도 되게 한다.

// 구독 실패를 콘솔에만 남긴다 (화면 동작은 그대로).
//
// 화면을 막지 않는 것은 정책이지만, 신호가 0 이면 복합 인덱스 미배포나 규칙 변경이
// "해설이 영구히 안 뜨는 앱" 으로 조용히 굳는다. 로컬 에뮬레이터는 인덱스 없이도
// 돌아가 더 늦게 드러난다. 키·개인정보는 넣지 않는다 — 메시지만 남긴다.
const warnCommentarySubscription = (reason: string, error: unknown): void => {
  console.warn(
    `AI commentary subscription ${reason}, showing events without commentary:`,
    error instanceof Error ? error.message : "unknown error",
  );
};

export class FirestoreCommentaryRepository implements CommentaryReadRepository {
  // locale + explanationLevel 두 등식 필터에 timestamp 정렬이라
  // 복합 인덱스(locale ASC + explanationLevel ASC + timestamp DESC)가 필요하다 —
  // firestore.indexes.json 참고. 에뮬레이터는 인덱스 없이도 동작한다.
  subscribeCommentary(
    sessionId: string,
    locale: SupportedLocale,
    explanationLevel: ExplanationLevel,
    limit: number,
    onChange: (commentary: AiCommentary[]) => void,
  ): Unsubscribe {
    const plan = buildCommentaryQueryPlan(
      sessionId,
      locale,
      explanationLevel,
      limit,
    );
    const commentaryQuery = query(
      collection(getFirestoreDb(), plan.collectionPath),
      where("locale", "==", plan.locale),
      where("explanationLevel", "==", plan.explanationLevel),
      orderBy(plan.orderByField, plan.isDescending ? "desc" : "asc"),
      limitTo(plan.limit),
    );

    return onSnapshot(
      commentaryQuery,
      (querySnapshot) => {
        const items: AiCommentary[] = [];
        let firstParseError: unknown = null;
        let skippedCount = 0;

        for (const document of querySnapshot.docs) {
          // 문서 하나가 깨져도 나머지 해설까지 잃지 않는다. 해설은 이벤트에
          // 붙는 부가 정보라 일부 누락이 화면을 막아서는 안 된다.
          try {
            items.push(
              toAiCommentaryFromDocument(parseCommentaryDocument(document.data())),
            );
          } catch (error) {
            // 스냅샷마다 한 번만 모아서 알린다 — 문서별로 찍으면 스키마가
            // 통째로 어긋났을 때 콘솔이 같은 줄로 뒤덮인다.
            if (firstParseError === null) {
              firstParseError = error;
            }

            skippedCount += 1;

            continue;
          }
        }

        if (skippedCount > 0) {
          warnCommentarySubscription(
            `skipped ${skippedCount}/${querySnapshot.docs.length} malformed document(s)`,
            firstParseError,
          );
        }

        // 오름차순(오래된 것 먼저)으로 되돌려 이벤트 구독과 정렬 규칙을 맞춘다.
        onChange(items.reverse());
      },
      (error) => {
        // 인덱스 미배포 · 권한 등으로 구독이 실패해도 이벤트 표시를 막지 않는다.
        // 해설만 빈 채로 둔다 (docs/18 §폴백). 다만 흔적은 남긴다 — 삼키면
        // 인덱스가 빠진 배포를 아무도 알아채지 못한다.
        warnCommentarySubscription("failed", error);
        onChange([]);
      },
    );
  }
}
