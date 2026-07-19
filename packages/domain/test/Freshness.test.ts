import { describe, expect, it } from "vitest";
import { DataFreshnessStatus } from "../src/DataFreshnessStatus";
import { getFreshness, getFreshnessFromTimestamp } from "../src/Freshness";

describe("getFreshness", () => {
  it("0~5초는 live", () => {
    expect(getFreshness(0)).toBe(DataFreshnessStatus.Live);
    expect(getFreshness(5_000)).toBe(DataFreshnessStatus.Live);
  });

  it("5~15초는 delayed", () => {
    expect(getFreshness(5_001)).toBe(DataFreshnessStatus.Delayed);
    expect(getFreshness(15_000)).toBe(DataFreshnessStatus.Delayed);
  });

  it("15초 초과는 stale", () => {
    expect(getFreshness(15_001)).toBe(DataFreshnessStatus.Stale);
  });

  it("음수/비정상 값은 unknown", () => {
    expect(getFreshness(-1)).toBe(DataFreshnessStatus.Unknown);
    expect(getFreshness(Number.NaN)).toBe(DataFreshnessStatus.Unknown);
  });
});

describe("getFreshnessFromTimestamp", () => {
  it("파싱 불가한 timestamp 는 unknown", () => {
    expect(getFreshnessFromTimestamp("not-a-date", Date.now())).toBe(
      DataFreshnessStatus.Unknown,
    );
  });

  it("최근 timestamp 는 live", () => {
    const now = Date.parse("2026-07-19T05:00:10.000Z");
    const source = "2026-07-19T05:00:08.000Z";

    expect(getFreshnessFromTimestamp(source, now)).toBe(DataFreshnessStatus.Live);
  });
});
