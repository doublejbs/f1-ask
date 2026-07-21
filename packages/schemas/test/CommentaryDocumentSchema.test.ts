import {
  COMMENTARY_SCHEMA_VERSION,
  ExplanationLevel,
  RaceEventPriority,
  RaceEventType,
  SupportedLocale,
} from "@f1/domain";
import { describe, expect, it } from "vitest";
import { parseCommentaryDocument } from "../src/CommentarySchema";

const validDocument = {
  schemaVersion: COMMENTARY_SCHEMA_VERSION,
  sourceEventId: "2026-bel-race:penalty:penalty:HAM:1784467391000",
  sourceEventType: RaceEventType.Penalty,
  priority: RaceEventPriority.High,
  locale: SupportedLocale.Ko,
  explanationLevel: ExplanationLevel.Standard,
  text: "HAM 의 5초 페널티가 순위를 흔든다",
  timestamp: "2026-07-19T05:11:31.000Z",
  generatedAt: "2026-07-19T05:12:00.000Z",
  model: "gemini-3.5-flash",
};

describe("commentaryDocumentSchema", () => {
  it("유효한 저장 문서를 통과시킨다", () => {
    expect(() => parseCommentaryDocument(validDocument)).not.toThrow();
  });

  it("빈 해설 텍스트는 거부한다", () => {
    expect(() =>
      parseCommentaryDocument({ ...validDocument, text: "" }),
    ).toThrow();
  });

  it("모델 이름이 없으면 거부한다 — 품질 회귀 추적이 불가능해진다", () => {
    const { model, ...withoutModel } = validDocument;

    expect(() => parseCommentaryDocument(withoutModel)).toThrow();
    expect(model).toBe("gemini-3.5-flash");
  });

  it("알 수 없는 locale · 설명수준은 거부한다", () => {
    expect(() =>
      parseCommentaryDocument({ ...validDocument, locale: "kr" }),
    ).toThrow();
    expect(() =>
      parseCommentaryDocument({ ...validDocument, explanationLevel: "pro" }),
    ).toThrow();
  });

  it("ISO 8601 이 아닌 시각은 거부한다", () => {
    expect(() =>
      parseCommentaryDocument({ ...validDocument, timestamp: "2026-07-19" }),
    ).toThrow();
    expect(() =>
      parseCommentaryDocument({ ...validDocument, generatedAt: "방금" }),
    ).toThrow();
  });

  it("schemaVersion 이 없거나 0 이하면 거부한다", () => {
    expect(() =>
      parseCommentaryDocument({ ...validDocument, schemaVersion: 0 }),
    ).toThrow();
  });

  it("저장 문서에 담기지 않는 isMock 은 파싱 결과에 남지 않는다", () => {
    const parsed = parseCommentaryDocument({ ...validDocument, isMock: true });

    expect(Object.keys(parsed)).not.toContain("isMock");
  });
});
