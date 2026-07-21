import { describe, expect, it } from "vitest";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { SupportedLocale } from "../src/SupportedLocale";
import {
  DEFAULT_COMMENTARY_VARIANTS,
  parseCommentaryVariants,
  toCommentaryVariantKey,
} from "../src/worker/CommentaryVariant";

// 생성 변형 설정 (docs/18-ai-commentary-worker.md §변형).
// 변형 하나당 이벤트마다 호출·저장이 곱해진다 — 기본값이 한 조합인지 고정한다.

describe("parseCommentaryVariants", () => {
  it("설정이 없으면 ko × standard 한 조합이다", () => {
    const variants = parseCommentaryVariants(undefined);

    expect(variants).toHaveLength(1);
    expect(variants[0]).toEqual({
      locale: SupportedLocale.Ko,
      explanationLevel: ExplanationLevel.Standard,
    });
    expect(variants).toEqual([...DEFAULT_COMMENTARY_VARIANTS]);
  });

  it("코드 수정 없이 설정으로 변형을 늘린다", () => {
    const variants = parseCommentaryVariants("ko:standard, en:beginner");

    expect(variants.map(toCommentaryVariantKey)).toEqual([
      "ko:standard",
      "en:beginner",
    ]);
  });

  it("중복은 한 번만 남긴다", () => {
    expect(parseCommentaryVariants("ko:standard,ko:standard")).toHaveLength(1);
  });

  it("유효하지 않은 항목은 버리고 나머지는 살린다", () => {
    const variants = parseCommentaryVariants("ko:standard,xx:standard,ko:zzz");

    expect(variants.map(toCommentaryVariantKey)).toEqual(["ko:standard"]);
  });

  it("칸이 두 개가 아니면 거부한다", () => {
    // 뒷단을 조용히 버리면 오타가 다른 의미가 된 채 통과한다.
    const variants = parseCommentaryVariants("ko:standard:extra,en:beginner");

    expect(variants.map(toCommentaryVariantKey)).toEqual(["en:beginner"]);
  });

  it("전부 유효하지 않으면 기본값으로 되돌린다", () => {
    // 오타 하나로 해설이 통째로 멈추는 것보다 기본 조합이 도는 편이 안전하다.
    expect(parseCommentaryVariants("garbage")).toEqual([
      ...DEFAULT_COMMENTARY_VARIANTS,
    ]);
    expect(parseCommentaryVariants("   ")).toEqual([
      ...DEFAULT_COMMENTARY_VARIANTS,
    ]);
  });
});
