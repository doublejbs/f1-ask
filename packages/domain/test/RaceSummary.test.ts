import { describe, expect, it } from "vitest";
import { MockLlmProvider } from "../src/ai/MockLlmProvider";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { selectRaceSummaryData } from "../src/RaceSummary";
import { SupportedLocale } from "../src/SupportedLocale";

const START_EPOCH = Date.parse("2026-07-19T05:00:00.000Z");

// 경기 종료 시점 (t=122) 의 최종 상태.
const finalFrame = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  START_EPOCH,
).snapshotAt(122);

describe("selectRaceSummaryData", () => {
  const summary = selectRaceSummaryData(
    finalFrame.snapshot,
    finalFrame.events,
  );

  it("우승자는 최종 1위 드라이버다", () => {
    const leader = finalFrame.snapshot.drivers.find((d) => d.position === 1);

    expect(summary.winnerDriverNumber).toBe(leader?.driverNumber ?? null);
  });

  it("포디움은 상위 3명을 순서대로 담는다", () => {
    expect(summary.podiumDriverNumbers).toHaveLength(3);

    const positions = summary.podiumDriverNumbers.map(
      (driverNumber) =>
        finalFrame.snapshot.drivers.find((d) => d.driverNumber === driverNumber)
          ?.position,
    );

    expect(positions).toEqual([1, 2, 3]);
  });

  it("추월/피트 횟수를 이벤트에서 집계한다", () => {
    expect(summary.totalOvertakes).toBeGreaterThan(0);
    expect(summary.totalPitStops).toBeGreaterThan(0);
  });

  it("리타이어 드라이버를 최종 상태에서 집계한다", () => {
    // STR(18) 은 시나리오에서 리타이어한다.
    expect(summary.retiredDriverNumbers).toContain(18);
  });

  it("패스티스트 랩은 가장 빠른 fastest_lap 이벤트의 드라이버다", () => {
    // 시나리오상 t=100 의 NOR(4) 90.771 이 최속.
    expect(summary.fastestLapDriverNumber).toBe(4);
  });

  it("결정론적이다", () => {
    const again = selectRaceSummaryData(
      finalFrame.snapshot,
      finalFrame.events,
    );

    expect(again).toEqual(summary);
  });
});

describe("MockLlmProvider.generateSummary", () => {
  it("사실을 자연어로 서술하고 우승자 코드를 포함한다", async () => {
    const summary = selectRaceSummaryData(
      finalFrame.snapshot,
      finalFrame.events,
    );
    const winnerCode = finalFrame.snapshot.drivers.find(
      (d) => d.driverNumber === summary.winnerDriverNumber,
    )?.code;

    const result = await new MockLlmProvider().generateSummary({
      summary,
      snapshot: finalFrame.snapshot,
      locale: SupportedLocale.En,
    });

    expect(result.text).toContain(winnerCode ?? "");
    expect(result.text.toLowerCase()).toContain("recorded data");
  });

  it("locale 에 따라 언어가 바뀐다", async () => {
    const summary = selectRaceSummaryData(
      finalFrame.snapshot,
      finalFrame.events,
    );

    const ko = await new MockLlmProvider().generateSummary({
      summary,
      snapshot: finalFrame.snapshot,
      locale: SupportedLocale.Ko,
    });

    expect(ko.text).toMatch(/우승/);
  });
});
