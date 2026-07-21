import { RECENT_COMMENTARY_LIMIT } from "../ai/CommentaryContext";

// 해설 러닝 컨텍스트 (docs/18-ai-commentary-worker.md §러닝 컨텍스트의 저장).
//
// Cloud Functions 는 1분마다 새 프로세스로 뜬다. 직전 해설을 메모리에 둘 수 없으므로
// `runtime/eventCursor` 와 같은 방식으로 `runtime` 문서에 보관한다.
// 폴링 창 시작에 한 번 읽고 끝에 한 번 쓴다 — 이벤트마다 쓰면 이 문서 자체가
// 쓰기 폭증이 된다 (docs/16-poller-worker.md 에서 이미 겪은 실수다).
//
// 담는 것은 세 가지다.
//   1. recentTextsByVariant — 프롬프트에 넣을 직전 해설. 연속 이벤트가 같은 말을 되풀이하는 것을 막는다.
//   2. generatedKeys        — 이미 저장한 해설 문서 id. 중복 생성을 read 없이 걸러 낸다.
//   3. failureCounts        — 실패 횟수. 상한을 넘긴 해설을 영구히 포기한다.
//
// generatedKeys 를 두는 이유(= 이벤트마다 exists() 를 날리지 않는 이유):
// 해설 문서 id 는 멱등이라 존재 확인으로도 건너뛸 수 있지만, 그러면 이벤트 × 변형 수만큼
// 읽기가 발생한다. 이 문서는 어차피 창당 1회 읽으므로 그 안에 키를 실어 보내면
// 추가 읽기가 0 이다. 문서가 유실되면 최악의 경우 해설을 한 번 더 생성할 뿐이고,
// 문서 id 가 멱등이라 저장물은 늘지 않는다. failureCounts 도 같은 이유로 이 문서에 얹는다 —
// 재시도 상한을 두는 데 추가 I/O 가 한 건도 들지 않는다.
//
// 직전 해설을 **변형 키로 나눠** 담는 이유:
// 변형(locale × 설명수준)은 서로 다른 독자를 향한 다른 글이다. 평평한 배열 하나에 섞으면
// 한국어 해설이 영어 프롬프트의 "직전 해설"로 들어가고, 상한 N 건을 변형들이 나눠 써
// 변형당 실효 건수가 줄어 반복 제거 효과가 조용히 반감된다.

// 추적하는 해설 키의 상한.
//
// 근거(추정이 아니라 실제 크기다): 문서 id 는 `{eventId}:{locale}:{explanationLevel}` 이고
// 실측 eventId 는 50바이트대라 키 하나가 대략 70바이트다. 레이스 하나의 해설 대상은
// 47건 수준(스파 실측)이고 9 변형을 전부 켜도 423 건 ≈ 30KB 다. 상한 1000 이면 약 70KB 로
// 같은 문서에 얹힌 recentTextsByVariant · failureCounts 를 더해도 Firestore 문서 한도(1MB)의
// 10% 아래다. 즉 이 상한은 한도를 지키는 장치가 아니라 **한 레이스치를 2배 여유로 담는 크기**다.
// (이전 주석은 "문서 id 한도 1500바이트 × 1000 = 1.5MB" 를 근거로 들었는데 실제 키 길이와
//  맞지 않는 계산이었다.)
// 넘치면 가장 오래된 키부터 버린다 — 오래된 이벤트는 이미 해설이 저장돼 있다.
export const MAX_TRACKED_COMMENTARY_KEYS = 1000;

// 한 해설(이벤트 × 변형)을 몇 번까지 시도할지.
//
// 상한이 없으면 결정론적으로 실패하는 이벤트(콘텐츠 필터, 이상한 params 로 인한 빈 응답 등)를
// 레이스가 끝날 때까지 매 폴링 창마다 다시 부른다. 90분 레이스면 이벤트 1건당 최대 90회로
// "레이스당 47회 고정" 이 무너지고, 그 호출이 예산을 먹어 신규 이벤트가 굶는다.
// 3회면 일시적 장애(쿼터·네트워크)는 넘기고 결정론적 실패는 포기한다.
export const MAX_COMMENTARY_ATTEMPTS = 3;

export type CommentaryRunContext = {
  // 변형 키(`ko:standard`) → 그 변형의 직전 해설. 오래된 것 → 최근 순,
  // 변형마다 최대 RECENT_COMMENTARY_LIMIT 건.
  recentTextsByVariant: Record<string, string[]>;
  // 이미 저장한 해설 문서 id. 오래된 것부터 정렬해 둔다(잘라낼 때 기준).
  generatedKeys: string[];
  // 해설 문서 id → 지금까지의 실패 횟수. 성공하면 지운다.
  failureCounts: Record<string, number>;
  // 누적 생성 건수. 잘라내는 generatedKeys 와 달리 창을 넘어 계속 는다.
  generatedCount: number;
};

export const EMPTY_COMMENTARY_RUN_CONTEXT: CommentaryRunContext = {
  recentTextsByVariant: {},
  generatedKeys: [],
  failureCounts: {},
  generatedCount: 0,
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
};

// 변형별 직전 해설을 복원한다. 배열 하나(옛 평평한 형태)나 그 밖의 형태가 오면
// 통째로 빈 맥락으로 흡수한다 — 변형이 섞인 맥락을 이어받느니 한 창 비우는 편이 낫다.
const toRecentTextsByVariant = (value: unknown): Record<string, string[]> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const restored: Record<string, string[]> = {};

  for (const [variantKey, texts] of Object.entries(value)) {
    const restoredTexts = toStringArray(texts).slice(-RECENT_COMMENTARY_LIMIT);

    if (restoredTexts.length === 0) {
      continue;
    }

    restored[variantKey] = restoredTexts;
  }

  return restored;
};

const toFailureCounts = (value: unknown): Record<string, number> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const restored: Record<string, number> = {};

  for (const [docId, count] of Object.entries(value)) {
    if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) {
      continue;
    }

    restored[docId] = Math.floor(count);
  }

  return restored;
};

// 뒤쪽(=최근) 항목만 남긴다. Record 는 문자열 키의 삽입 순서를 유지하므로
// 가장 오래 전에 들어온 항목부터 버려진다.
const trimEntries = <T>(
  entries: Record<string, T>,
  maxEntries: number,
): Record<string, T> => {
  const pairs = Object.entries(entries);

  if (pairs.length <= maxEntries) {
    return entries;
  }

  return Object.fromEntries(pairs.slice(pairs.length - maxEntries));
};

// 임의의 Firestore 문서 데이터를 러닝 컨텍스트로 복원한다. 문서가 없거나 형태가 깨졌으면
// 빈 컨텍스트로 시작한다 (해설을 한 번 더 만들 뿐, 저장은 멱등이라 안전하다).
export const parseCommentaryRunContext = (
  data: unknown,
): CommentaryRunContext => {
  if (typeof data !== "object" || data === null) {
    return EMPTY_COMMENTARY_RUN_CONTEXT;
  }

  const raw = data as {
    recentTextsByVariant?: unknown;
    generatedKeys?: unknown;
    failureCounts?: unknown;
    generatedCount?: unknown;
  };
  const generatedCount = raw.generatedCount;

  return {
    recentTextsByVariant: toRecentTextsByVariant(raw.recentTextsByVariant),
    generatedKeys: toStringArray(raw.generatedKeys),
    failureCounts: toFailureCounts(raw.failureCounts),
    generatedCount:
      typeof generatedCount === "number" && Number.isFinite(generatedCount)
        ? generatedCount
        : 0,
  };
};

// 이 변형이 직전에 만든 해설. 다른 변형의 글은 절대 섞이지 않는다.
export const getRecentCommentary = (
  context: CommentaryRunContext,
  variantKey: string,
): string[] => context.recentTextsByVariant[variantKey] ?? [];

// 이미 저장한 해설인지. 같은 (이벤트, locale, 설명수준) 이면 문서 id 가 같다.
export const hasGeneratedCommentary = (
  context: CommentaryRunContext,
  docId: string,
): boolean => context.generatedKeys.includes(docId);

// 재시도 상한을 넘겨 영구히 포기할 해설인지.
export const hasExhaustedCommentaryRetries = (
  context: CommentaryRunContext,
  docId: string,
  maxAttempts: number = MAX_COMMENTARY_ATTEMPTS,
): boolean => (context.failureCounts[docId] ?? 0) >= maxAttempts;

// 저장 성공한 해설 하나를 컨텍스트에 반영한다. 순수 함수라 호출측이 결과를 이어 받는다.
export const appendCommentaryToRunContext = (
  context: CommentaryRunContext,
  variantKey: string,
  docId: string,
  text: string,
  maxTrackedKeys: number = MAX_TRACKED_COMMENTARY_KEYS,
): CommentaryRunContext => {
  const mergedKeys = [...context.generatedKeys, docId];
  const overflow = Math.max(0, mergedKeys.length - maxTrackedKeys);
  // 성공했으니 실패 이력은 지운다. 일시적 장애로 쌓인 횟수가 남아 있으면
  // 나중에 이 문서를 다시 만들어야 할 때 상한에 먼저 걸린다.
  const failureCounts = { ...context.failureCounts };

  delete failureCounts[docId];

  return {
    recentTextsByVariant: {
      ...context.recentTextsByVariant,
      [variantKey]: [
        ...getRecentCommentary(context, variantKey),
        text,
      ].slice(-RECENT_COMMENTARY_LIMIT),
    },
    generatedKeys: mergedKeys.slice(overflow),
    failureCounts,
    generatedCount: context.generatedCount + 1,
  };
};

// 실패 한 번을 기록한다. 컨텍스트 문서는 어차피 창당 1회 쓰므로 추가 I/O 가 없다.
export const recordCommentaryFailure = (
  context: CommentaryRunContext,
  docId: string,
  maxTrackedKeys: number = MAX_TRACKED_COMMENTARY_KEYS,
): CommentaryRunContext => ({
  ...context,
  failureCounts: trimEntries(
    {
      ...context.failureCounts,
      [docId]: (context.failureCounts[docId] ?? 0) + 1,
    },
    maxTrackedKeys,
  ),
});
