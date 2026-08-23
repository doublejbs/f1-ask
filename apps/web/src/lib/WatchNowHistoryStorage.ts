import { WatchNowSignal } from "@f1/domain";

// Watch now "지난 신호"를 폰(localStorage)에 **세션별로** 보존한다. PWA 를 껐다 켜거나 iOS 가
// 백그라운드에서 웹뷰를 정리해도 오늘 경기 기록이 남게 하는 것이 목적이다(사용자 요청).
//
// 클라우드가 아니라 기기 로컬 저장인 이유: 이 기록은 클라이언트(폰)가 스냅샷을 보고 계산하는
// 값이고 내 폰에서 오늘 경기용이다. 지금 구독 중인 dev Firebase 는 규칙상 클라이언트 쓰기가
// 막혀 있어(공개 읽기·서버 쓰기) Firestore 에 실을 수도 없다.

// 세션마다 키를 분리한다 — 다른 경기 기록이 섞이지 않게. v1 은 저장 포맷 버전.
const KEY_PREFIX = "watchnow:history:v1:";

const storageKey = (sessionId: string): string => `${KEY_PREFIX}${sessionId}`;

// localStorage 는 사파리 프라이빗 모드·용량 초과·SSR 에서 던지거나 없을 수 있다. 저장/복원
// 실패가 라이브 화면을 막으면 안 되므로 접근 자체를 방어한다 — 기록 보존은 부가 기능이다.
const safeLocalStorage = (): Storage | null => {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage;
  } catch {
    return null;
  }
};

// 저장된 지난 신호를 시간순(오래된 것 먼저)으로 돌려준다 — WatchNowFeed.hydrateHistory 가
// 그 순서를 가정한다. 없거나 손상됐으면 빈 배열.
export const loadWatchNowHistory = (sessionId: string): WatchNowSignal[] => {
  const store = safeLocalStorage();

  if (store === null || sessionId.length === 0) {
    return [];
  }

  try {
    const raw = store.getItem(storageKey(sessionId));

    if (raw === null) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    // 내가 쓴 값이지만 옛 포맷·손상 데이터가 화면을 깨지 않게 최소 형태만 검증한다.
    return parsed.filter(isWatchNowSignal);
  } catch {
    return [];
  }
};

export const saveWatchNowHistory = (
  sessionId: string,
  signals: WatchNowSignal[],
): void => {
  const store = safeLocalStorage();

  if (store === null || sessionId.length === 0) {
    return;
  }

  try {
    store.setItem(storageKey(sessionId), JSON.stringify(signals));
  } catch {
    // 용량 초과(QuotaExceeded) 등 — 조용히 포기한다. 다음 저장에서 다시 시도된다.
  }
};

// 화면이 실제로 읽는 필드만 확인하는 최소 검증(zod 는 과하다 — 신뢰 경계가 아니다).
const isWatchNowSignal = (value: unknown): value is WatchNowSignal => {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.type === "string" &&
    typeof candidate.driverNumber === "number" &&
    typeof candidate.driverCode === "string" &&
    typeof candidate.detectedAt === "string"
  );
};
