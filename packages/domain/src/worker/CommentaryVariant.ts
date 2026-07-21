import { ExplanationLevel, isExplanationLevel } from "../ExplanationLevel";
import { isSupportedLocale, SupportedLocale } from "../SupportedLocale";

// 워커가 생성할 해설 변형 (docs/18-ai-commentary-worker.md §변형).
//
// locale 3 × 설명수준 3 = 9 변형이면 레이스당 423 회다. Gemini 무료 티어 한도와
// 지출 상한($5) 때문에 검증 단계는 `ko × standard` 한 조합으로 시작한다.
// 변형이 하나 늘 때마다 이벤트당 호출·저장이 그만큼 곱해진다 — 기본값을 임의로 늘리지 않는다.
// 늘릴 때는 코드가 아니라 환경변수로 바꾼다.

export type CommentaryVariant = {
  locale: SupportedLocale;
  explanationLevel: ExplanationLevel;
};

// 검증 단계 기본값. 딱 한 조합이다.
export const DEFAULT_COMMENTARY_VARIANTS: readonly CommentaryVariant[] = [
  { locale: SupportedLocale.Ko, explanationLevel: ExplanationLevel.Standard },
];

// 변형 하나를 표현하는 문자열. 설정과 문서 id 양쪽에서 같은 순서를 쓴다.
const VARIANT_SEPARATOR = ",";
const FIELD_SEPARATOR = ":";

export const toCommentaryVariantKey = (variant: CommentaryVariant): string =>
  `${variant.locale}${FIELD_SEPARATOR}${variant.explanationLevel}`;

// `"ko:standard,en:beginner"` 형태의 설정을 변형 목록으로 바꾼다.
//
// 값이 없거나 유효한 항목이 하나도 없으면 기본값으로 되돌린다 — 오타 하나로 해설이
// 통째로 멈추는 것보다 기본 조합이 도는 편이 안전하다. 중복은 한 번만 남긴다.
export const parseCommentaryVariants = (
  raw: string | undefined,
): CommentaryVariant[] => {
  if (raw === undefined || raw.trim().length === 0) {
    return [...DEFAULT_COMMENTARY_VARIANTS];
  }

  const parsed = new Map<string, CommentaryVariant>();

  for (const entry of raw.split(VARIANT_SEPARATOR)) {
    const fields = entry.trim().split(FIELD_SEPARATOR);

    // 정확히 두 칸이어야 한다. 구조분해로 뒷단을 버리면 `"ko:standard:extra"` 같은
    // 오타가 조용히 통과해 설정한 것과 다른 변형이 돈다.
    if (fields.length !== 2) {
      continue;
    }

    const locale = (fields[0] ?? "").trim();
    const level = (fields[1] ?? "").trim();

    if (!isSupportedLocale(locale) || !isExplanationLevel(level)) {
      continue;
    }

    const variant: CommentaryVariant = {
      locale,
      explanationLevel: level,
    };

    parsed.set(toCommentaryVariantKey(variant), variant);
  }

  if (parsed.size === 0) {
    return [...DEFAULT_COMMENTARY_VARIANTS];
  }

  return [...parsed.values()];
};
