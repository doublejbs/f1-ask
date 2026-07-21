import { describe, expect, it } from "vitest";
import { RECENT_COMMENTARY_LIMIT } from "../src/ai/CommentaryContext";
import {
  appendCommentaryToRunContext,
  EMPTY_COMMENTARY_RUN_CONTEXT,
  getRecentCommentary,
  hasExhaustedCommentaryRetries,
  hasGeneratedCommentary,
  MAX_COMMENTARY_ATTEMPTS,
  parseCommentaryRunContext,
  recordCommentaryFailure,
} from "../src/worker/CommentaryRunContext";

// 러닝 컨텍스트 (docs/18-ai-commentary-worker.md §러닝 컨텍스트의 저장).
// runtime 문서 하나에 변형별 직전 해설 · 이미 만든 키 · 실패 횟수를 담아
// 창당 읽기 1 · 쓰기 1 로 끝낸다.

const KO = "ko:standard";
const EN = "en:beginner";

describe("parseCommentaryRunContext", () => {
  it("문서가 없으면 빈 컨텍스트로 시작한다", () => {
    expect(parseCommentaryRunContext(undefined)).toEqual(
      EMPTY_COMMENTARY_RUN_CONTEXT,
    );
    expect(parseCommentaryRunContext(null)).toEqual(
      EMPTY_COMMENTARY_RUN_CONTEXT,
    );
  });

  it("형태가 깨져 있어도 빈 컨텍스트로 흡수한다", () => {
    const context = parseCommentaryRunContext({
      recentTextsByVariant: "문자열",
      generatedKeys: [1, "", "ok"],
      failureCounts: ["배열"],
      generatedCount: "many",
    });

    expect(context.recentTextsByVariant).toEqual({});
    expect(context.generatedKeys).toEqual(["ok"]);
    expect(context.failureCounts).toEqual({});
    expect(context.generatedCount).toBe(0);
  });

  it("옛 평평한 recentTexts 형태는 빈 맥락으로 흡수한다", () => {
    // 변형이 섞인 맥락을 이어받느니 한 창 비우는 편이 낫다.
    const context = parseCommentaryRunContext({
      recentTexts: ["해설 1", "해설 2"],
      generatedKeys: ["doc:1"],
      generatedCount: 2,
    });

    expect(context.recentTextsByVariant).toEqual({});
    expect(context.generatedKeys).toEqual(["doc:1"]);
    expect(context.generatedCount).toBe(2);
  });

  it("직전 해설은 변형별로 최근 N 건만 복원한다", () => {
    const texts = Array.from(
      { length: RECENT_COMMENTARY_LIMIT + 3 },
      (_, index) => `해설 ${index}`,
    );

    const context = parseCommentaryRunContext({
      recentTextsByVariant: { [KO]: texts },
      generatedKeys: [],
      generatedCount: 10,
    });

    expect(context.recentTextsByVariant[KO]).toHaveLength(
      RECENT_COMMENTARY_LIMIT,
    );
    expect(context.recentTextsByVariant[KO]?.at(-1)).toBe(
      `해설 ${RECENT_COMMENTARY_LIMIT + 2}`,
    );
    expect(context.generatedCount).toBe(10);
  });

  it("실패 횟수는 양의 정수만 복원한다", () => {
    const context = parseCommentaryRunContext({
      failureCounts: { "doc:1": 2, "doc:2": -1, "doc:3": "많이", "doc:4": 1.7 },
    });

    expect(context.failureCounts).toEqual({ "doc:1": 2, "doc:4": 1 });
  });
});

describe("appendCommentaryToRunContext", () => {
  it("직전 해설을 최근 N 건으로 자르고 누적 카운터는 계속 는다", () => {
    let context = EMPTY_COMMENTARY_RUN_CONTEXT;

    for (let index = 0; index < RECENT_COMMENTARY_LIMIT + 2; index += 1) {
      context = appendCommentaryToRunContext(
        context,
        KO,
        `doc:${index}`,
        `해설 ${index}`,
      );
    }

    expect(getRecentCommentary(context, KO)).toHaveLength(
      RECENT_COMMENTARY_LIMIT,
    );
    expect(context.generatedCount).toBe(RECENT_COMMENTARY_LIMIT + 2);
    expect(context.generatedKeys).toHaveLength(RECENT_COMMENTARY_LIMIT + 2);
  });

  it("변형마다 자기 직전 해설을 온전히 갖는다", () => {
    let context = EMPTY_COMMENTARY_RUN_CONTEXT;

    context = appendCommentaryToRunContext(context, KO, "doc:ko", "한국어 해설");
    context = appendCommentaryToRunContext(context, EN, "doc:en", "English");

    expect(getRecentCommentary(context, KO)).toEqual(["한국어 해설"]);
    expect(getRecentCommentary(context, EN)).toEqual(["English"]);
  });

  it("N 건 상한을 변형끼리 나눠 쓰지 않는다", () => {
    let context = EMPTY_COMMENTARY_RUN_CONTEXT;

    for (let index = 0; index < RECENT_COMMENTARY_LIMIT; index += 1) {
      context = appendCommentaryToRunContext(
        context,
        KO,
        `doc:ko:${index}`,
        `한국어 ${index}`,
      );
      context = appendCommentaryToRunContext(
        context,
        EN,
        `doc:en:${index}`,
        `english ${index}`,
      );
    }

    expect(getRecentCommentary(context, KO)).toHaveLength(
      RECENT_COMMENTARY_LIMIT,
    );
    expect(getRecentCommentary(context, EN)).toHaveLength(
      RECENT_COMMENTARY_LIMIT,
    );
  });

  it("키가 상한을 넘으면 가장 오래된 것부터 버린다", () => {
    let context = EMPTY_COMMENTARY_RUN_CONTEXT;

    for (const docId of ["doc:1", "doc:2", "doc:3"]) {
      context = appendCommentaryToRunContext(context, KO, docId, "해설", 2);
    }

    expect(context.generatedKeys).toEqual(["doc:2", "doc:3"]);
    expect(hasGeneratedCommentary(context, "doc:1")).toBe(false);
    expect(hasGeneratedCommentary(context, "doc:3")).toBe(true);
  });

  it("성공하면 그 문서의 실패 이력을 지운다", () => {
    let context = recordCommentaryFailure(EMPTY_COMMENTARY_RUN_CONTEXT, "doc:1");

    context = appendCommentaryToRunContext(context, KO, "doc:1", "해설");

    expect(context.failureCounts).toEqual({});
  });

  it("원본을 바꾸지 않는다", () => {
    const next = appendCommentaryToRunContext(
      EMPTY_COMMENTARY_RUN_CONTEXT,
      KO,
      "doc:1",
      "해설",
    );

    expect(EMPTY_COMMENTARY_RUN_CONTEXT.generatedKeys).toEqual([]);
    expect(EMPTY_COMMENTARY_RUN_CONTEXT.recentTextsByVariant).toEqual({});
    expect(next.generatedKeys).toEqual(["doc:1"]);
  });
});

describe("recordCommentaryFailure", () => {
  it("상한에 닿기 전까지는 다시 시도한다", () => {
    let context = EMPTY_COMMENTARY_RUN_CONTEXT;

    for (let attempt = 1; attempt < MAX_COMMENTARY_ATTEMPTS; attempt += 1) {
      context = recordCommentaryFailure(context, "doc:1");

      expect(hasExhaustedCommentaryRetries(context, "doc:1")).toBe(false);
    }

    context = recordCommentaryFailure(context, "doc:1");

    expect(hasExhaustedCommentaryRetries(context, "doc:1")).toBe(true);
  });

  it("실패 이력이 상한을 넘으면 가장 오래된 것부터 버린다", () => {
    let context = EMPTY_COMMENTARY_RUN_CONTEXT;

    for (const docId of ["doc:1", "doc:2", "doc:3"]) {
      context = recordCommentaryFailure(context, docId, 2);
    }

    expect(Object.keys(context.failureCounts)).toEqual(["doc:2", "doc:3"]);
  });

  it("원본을 바꾸지 않는다", () => {
    const next = recordCommentaryFailure(EMPTY_COMMENTARY_RUN_CONTEXT, "doc:1");

    expect(EMPTY_COMMENTARY_RUN_CONTEXT.failureCounts).toEqual({});
    expect(next.failureCounts).toEqual({ "doc:1": 1 });
  });
});
