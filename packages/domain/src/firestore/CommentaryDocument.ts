import { ExplanationLevel } from "../ExplanationLevel";
import { RaceEventPriority } from "../RaceEventPriority";
import { RaceEventType } from "../RaceEventType";
import { SupportedLocale } from "../SupportedLocale";
import { AI_COMMENTARY_ID_PREFIX, AiCommentary } from "../ai/AiCommentary";
import { CommentaryContext } from "../ai/CommentaryContext";

// 워커가 생성한 해설의 저장 형식 (docs/18-ai-commentary-worker.md §저장).
//
// `aiCache` 가 아니라 `sessions/{sessionId}/aiCommentary` 에 두는 이유는 규칙이다 —
// `aiCache` 는 `allow read, write: if false` 라 클라이언트가 읽지 못하는데,
// 해설은 이벤트와 함께 화면에 뜨는 공개 읽기 데이터다.
// `aiCommentary` 는 규칙과 아키텍처 문서에 이미 있던 컬렉션이다 — 새로 만들지 않는다.
export const COMMENTARY_SCHEMA_VERSION = 1;

// Firestore 문서 id 상한. UTF-8 바이트 기준 1500 이다.
export const MAX_FIRESTORE_DOC_ID_BYTES = 1500;

// 문서 id 에 그대로 쓸 수 있는 문자. Firestore 가 실제로 막는 것은 `/` 뿐이지만
// URL · 로그 · 에뮬레이터 경로에서 새는 사고를 막으려고 보수적으로 좁힌다.
const DOC_ID_SAFE_CHAR = /^[A-Za-z0-9:._-]$/;

// 금지 문자를 감싸는 이스케이프 기호. 안전 문자 집합 밖이라 자기 자신도 이스케이프된다.
const ESCAPE_MARK = "~";

const encoder = new TextEncoder();

const measureByteLength = (value: string): number =>
  encoder.encode(value).length;

// 금지 문자를 `~<코드포인트 16진>~` 로 바꾼다. `~` 자신도 바꾸므로 서로 다른 입력이
// 같은 id 로 합쳐지지 않는다 — 단순 치환(`/` → `_`)이면 충돌이 생긴다.
const escapeDocIdSegment = (value: string): string => {
  let escaped = "";

  for (const char of value) {
    if (char !== ESCAPE_MARK && DOC_ID_SAFE_CHAR.test(char)) {
      escaped += char;

      continue;
    }

    const codePoint = char.codePointAt(0) ?? 0;

    escaped += `${ESCAPE_MARK}${codePoint.toString(16).toUpperCase()}${ESCAPE_MARK}`;
  }

  return escaped;
};

// FNV-1a 32bit. 길이 상한을 넘긴 eventId 를 잘라낼 때 잘린 부분을 대신할 지문이다.
// 외부 의존 없이 결정론적이면 충분하다 — 암호학적 용도가 아니다.
const hashSegment = (value: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
};

const truncateToByteLength = (value: string, maxBytes: number): string => {
  let truncated = value;

  while (truncated.length > 0 && measureByteLength(truncated) > maxBytes) {
    truncated = truncated.slice(0, -1);
  }

  return truncated;
};

// 해설 문서 id. `{eventId}:{locale}:{explanationLevel}` 를 정규화한 값이다.
//
// 같은 (이벤트, locale, 설명수준) 이면 항상 같은 id 가 나온다 — 재처리해도 문서가
// 늘지 않는다(멱등). 이벤트 문서가 `deduplicationKey` 를 id 로 쓰는 것과 같은 방식이되,
// 여기에는 locale · 설명수준이 붙으므로 정규화를 한 겹 더 둔다.
export const toCommentaryDocId = (
  eventId: string,
  locale: SupportedLocale,
  explanationLevel: ExplanationLevel,
): string => {
  const suffix = `:${escapeDocIdSegment(locale)}:${escapeDocIdSegment(explanationLevel)}`;
  const escapedEventId = escapeDocIdSegment(eventId);
  const docId = `${escapedEventId}${suffix}`;

  if (measureByteLength(docId) <= MAX_FIRESTORE_DOC_ID_BYTES) {
    return docId;
  }

  const fingerprint = `${ESCAPE_MARK}${hashSegment(escapedEventId)}`;
  const budget =
    MAX_FIRESTORE_DOC_ID_BYTES -
    measureByteLength(suffix) -
    measureByteLength(fingerprint);

  return `${truncateToByteLength(escapedEventId, budget)}${fingerprint}${suffix}`;
};

// Firestore 에 저장하는 해설 문서.
//
// `isMock` 은 담지 않는다. mock 텍스트는 애초에 저장 대상이 아니므로
// (docs/18 §폴백) 저장된 문서는 언제나 실제 생성물이다.
// `model` 은 나중에 품질 회귀를 모델 단위로 추적하려면 필요하다.
export type CommentaryDocument = {
  schemaVersion: number;
  sourceEventId: string;
  sourceEventType: RaceEventType;
  priority: RaceEventPriority;
  locale: SupportedLocale;
  explanationLevel: ExplanationLevel;
  text: string;
  // 원 이벤트 시각. 클라이언트가 이벤트와 같은 축으로 정렬한다.
  timestamp: string;
  // 해설을 만든 시각. 원 이벤트 시각과 다를 수 있다(재처리 · 지연 생성).
  generatedAt: string;
  model: string;
  // 해설이 생성 시 본 시점 맥락(순위 슬라이스·세션 상태·이벤트 요약).
  // 과거 해설에 질문할 때 "현재"가 아니라 이 시점의 순위로 답하게 한다 —
  // 재조회 없이 저장된 맥락을 그대로 쓴다 (docs/21-commentary-ask.md §시점 맥락을 해설 문서에 저장한다).
  //
  // optional 인 이유: 다음 단계에서 워커가 채우기 전이거나, mock · replay 경로에서는 없을 수 있다.
  // 파싱은 방어적으로 — 없으면 undefined 다.
  pointInTimeContext?: CommentaryContext;
};

// 도메인 해설 → 저장 문서.
//
// mock 해설은 거부한다. 저장하면 키를 고친 뒤에도 "경기의 주목할 만한 순간입니다" 가
// 영구히 남는다(docs/18 §폴백). 호출자가 실수로 넘기면 조용히 통과시키지 않는다.
// pointInTimeContext 는 optional 이다. 다음 단계(워커·API 라우트)에서 해설이 생성 시 본
// 맥락을 넘겨 채운다. 넘기지 않으면 필드 자체를 담지 않는다 — Firestore 는 undefined 값을
// 거부하고, 기존 문서 형태(필드 없음)도 그대로 유지되어야 하기 때문이다.
export const toCommentaryDocument = (
  commentary: AiCommentary,
  locale: SupportedLocale,
  explanationLevel: ExplanationLevel,
  model: string,
  generatedAt: string,
  pointInTimeContext?: CommentaryContext,
): CommentaryDocument => {
  if (commentary.isMock) {
    throw new Error("mock 해설은 Firestore 에 저장하지 않는다");
  }

  const document: CommentaryDocument = {
    schemaVersion: COMMENTARY_SCHEMA_VERSION,
    sourceEventId: commentary.sourceEventId,
    sourceEventType: commentary.sourceEventType,
    priority: commentary.priority,
    locale,
    explanationLevel,
    text: commentary.text,
    timestamp: commentary.timestamp,
    generatedAt,
    model,
  };

  if (pointInTimeContext !== undefined) {
    document.pointInTimeContext = pointInTimeContext;
  }

  return document;
};

// 저장 문서 → 도메인 해설. 클라이언트는 구독한 문서를 결국 AiCommentary 로 써야 한다.
// id 는 `toAiCommentary` 와 같은 규칙으로 복원하고, 저장된 문서는 언제나 실제
// 생성물이므로 isMock 은 false 다.
export const toAiCommentaryFromDocument = (
  document: CommentaryDocument,
): AiCommentary => {
  const commentary: AiCommentary = {
    id: `${AI_COMMENTARY_ID_PREFIX}${document.sourceEventId}`,
    sourceEventId: document.sourceEventId,
    sourceEventType: document.sourceEventType,
    priority: document.priority,
    text: document.text,
    timestamp: document.timestamp,
    isMock: false,
  };

  // 저장된 시점 맥락을 도메인 해설로 실어 나른다. 이게 없으면 클라이언트가 해설을 탭해도
  // focus.context 를 채울 데가 없어 3단계 질문 UI 가 성립하지 않는다
  // (docs/21-commentary-ask.md §질문 경로 확장). 옛 문서엔 필드가 없어 undefined 다.
  if (document.pointInTimeContext !== undefined) {
    commentary.pointInTimeContext = document.pointInTimeContext;
  }

  return commentary;
};
