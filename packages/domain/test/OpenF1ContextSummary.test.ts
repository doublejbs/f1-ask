import { describe, expect, it } from "vitest";
import { TireCompound } from "../src/TireCompound";
import { buildLiveContextSummary } from "../src/openf1/OpenF1ContextSummary";
import { OpenF1SessionData } from "../src/openf1/OpenF1Types";
import { loadBelgianGpSessionData } from "./fixtures/BelgianGpFixture";

const parseMs = (date: string | null): number =>
  date === null ? Number.NaN : Date.parse(date);

const belgianGp = loadBelgianGpSessionData();

// 레이스 마지막 랩 시각(= "지금이 경기 끝"인 시점).
const raceEndMs = Math.max(
  ...belgianGp.laps
    .map((lap) => parseMs(lap.date_start))
    .filter((ms) => !Number.isNaN(ms)),
);

// 경기 중반 시점. 이 뒤에 일어나는 피트·스틴트는 집계에서 빠져야 한다.
const midRaceMs = Date.parse("2026-07-19T13:40:00.000Z");

const stintOf = (
  summary: ReturnType<typeof buildLiveContextSummary>,
  driverNumber: number,
) => summary.stints.find((entry) => entry.driverNumber === driverNumber);

describe("buildLiveContextSummary — 벨기에 GP 회귀", () => {
  it("경기 끝 시점의 피트 총횟수·중앙값이 실데이터와 일치한다", () => {
    const summary = buildLiveContextSummary(belgianGp, raceEndMs);

    // 실측: 28회, pit_duration 전부 non-null, 중앙값 24.7365초.
    expect(summary.pits.totalStops).toBe(28);
    expect(summary.pits.medianDurationSeconds).toBeCloseTo(24.7365, 4);
  });

  it("추월 데이터가 없는 픽스처에서는 추월 요약이 0/null 이다", () => {
    const summary = buildLiveContextSummary(belgianGp, raceEndMs);

    // 이 축약본 픽스처엔 overtakes 엔드포인트가 없다(감지에 안 쓰는 필드는 제거됨).
    expect(summary.overtakes.total).toBe(0);
    expect(summary.overtakes.mostActiveDriverNumber).toBeNull();
    expect(summary.overtakes.mostActiveCount).toBe(0);
  });

  it("스틴트 이력을 몇 번째·직전 compound·시작 랩·마지막 피트 랩으로 담는다", () => {
    const summary = buildLiveContextSummary(belgianGp, raceEndMs);

    // 실측 스틴트: #44 MEDIUM@1-20 → HARD@21-44, 피트 랩 20.
    const hamilton = stintOf(summary, 44);

    expect(hamilton).toBeDefined();
    expect(hamilton?.stintCount).toBe(2);
    expect(hamilton?.currentStintStartLap).toBe(21);
    expect(hamilton?.previousCompound).toBe(TireCompound.Medium);
    expect(hamilton?.lastPitLap).toBe(20);

    // 실측 스틴트: #1 HARD@1-30 → MEDIUM@31-44, 피트 랩 30.
    const verstappen = stintOf(summary, 1);

    expect(verstappen?.stintCount).toBe(2);
    expect(verstappen?.currentStintStartLap).toBe(31);
    expect(verstappen?.previousCompound).toBe(TireCompound.Hard);
    expect(verstappen?.lastPitLap).toBe(30);
  });
});

describe("buildLiveContextSummary — nowMs 로 '그 시점까지'만 집계", () => {
  it("경기 중반 시점이면 그 뒤의 피트가 총횟수에서 빠진다", () => {
    const summary = buildLiveContextSummary(belgianGp, midRaceMs);

    // 실측: 13:40 까지 피트 14회(전체 28회 중 절반).
    expect(summary.pits.totalStops).toBe(14);
    expect(summary.pits.medianDurationSeconds).toBeCloseTo(24.4935, 4);
  });

  it("아직 시작 안 한 스틴트·아직 안 한 피트는 그 시점 요약에서 빠진다", () => {
    const summary = buildLiveContextSummary(belgianGp, midRaceMs);

    // 13:40 에 #44 는 18랩째, 아직 첫 스틴트(MEDIUM@1-20) 중이고 피트 전이다.
    const hamilton = stintOf(summary, 44);

    expect(hamilton?.stintCount).toBe(1);
    expect(hamilton?.currentStintStartLap).toBe(1);
    expect(hamilton?.previousCompound).toBeNull();
    expect(hamilton?.lastPitLap).toBeNull();
  });
});

describe("buildLiveContextSummary — 합성 데이터로 집계 정확성", () => {
  const baseMeta = belgianGp.meta;

  const makeData = (
    overrides: Partial<OpenF1SessionData>,
  ): OpenF1SessionData => ({
    meta: baseMeta,
    drivers: [
      {
        driver_number: 1,
        name_acronym: "VER",
        full_name: "Max Verstappen",
        team_name: "Red Bull",
      },
      {
        driver_number: 4,
        name_acronym: "NOR",
        full_name: "Lando Norris",
        team_name: "McLaren",
      },
    ],
    positions: [],
    intervals: [],
    stints: [],
    laps: [],
    pits: [],
    raceControl: [],
    ...overrides,
  });

  it("피트 중앙값은 null 값을 제외하고 계산한다", () => {
    const data = makeData({
      pits: [
        { driver_number: 1, lap_number: 10, date: "2026-07-19T13:10:00Z", pit_duration: 20 },
        { driver_number: 4, lap_number: 11, date: "2026-07-19T13:11:00Z", pit_duration: null },
        { driver_number: 1, lap_number: 20, date: "2026-07-19T13:20:00Z", pit_duration: 30 },
      ],
    });

    const summary = buildLiveContextSummary(data, Date.parse("2026-07-19T14:00:00Z"));

    // 총 3회(횟수는 null 도 센다), 중앙값은 non-null 표본 [20, 30] → 25.
    expect(summary.pits.totalStops).toBe(3);
    expect(summary.pits.medianDurationSeconds).toBe(25);
  });

  it("유효한 피트 시간 표본이 없으면 중앙값은 null 이다", () => {
    const data = makeData({
      pits: [
        { driver_number: 1, lap_number: 10, date: "2026-07-19T13:10:00Z", pit_duration: null },
      ],
    });

    const summary = buildLiveContextSummary(data, Date.parse("2026-07-19T14:00:00Z"));

    expect(summary.pits.totalStops).toBe(1);
    expect(summary.pits.medianDurationSeconds).toBeNull();
  });

  it("추월 총횟수와 가장 활발한 드라이버를 집계한다", () => {
    const data = makeData({
      overtakes: [
        { date: "2026-07-19T13:10:00Z", position: 3, overtaking_driver_number: 4, overtaken_driver_number: 1 },
        { date: "2026-07-19T13:12:00Z", position: 2, overtaking_driver_number: 4, overtaken_driver_number: 1 },
        { date: "2026-07-19T13:14:00Z", position: 5, overtaking_driver_number: 1, overtaken_driver_number: 4 },
        // 시점 이후 추월은 빠진다.
        { date: "2026-07-19T15:00:00Z", position: 1, overtaking_driver_number: 1, overtaken_driver_number: 4 },
      ],
    });

    const summary = buildLiveContextSummary(data, Date.parse("2026-07-19T14:00:00Z"));

    expect(summary.overtakes.total).toBe(3);
    expect(summary.overtakes.mostActiveDriverNumber).toBe(4);
    expect(summary.overtakes.mostActiveCount).toBe(2);
  });
});
