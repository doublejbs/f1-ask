import { describe, expect, it } from "vitest";
import { SafetyCarKind } from "../src/SafetyCarKind";
import { buildLiveContextSummary } from "../src/openf1/OpenF1ContextSummary";
import {
  OpenF1Lap,
  OpenF1SessionData,
} from "../src/openf1/OpenF1Types";
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

// 경기 중반: 이 시점 이후의 리타이어·선두변경·SC 는 다이제스트에 새면 안 된다(수용 기준 §9).
// 13:45 은 리더가 21랩, STR(#18, 26랩에 정지)이 아직 달리는 중인 시점이다.
const midRaceMs = Date.parse("2026-07-19T13:45:00.000Z");

const narrativeOf = (data: OpenF1SessionData, nowMs: number) => {
  const summary = buildLiveContextSummary(data, nowMs);

  expect(summary.narrative).toBeDefined();

  return summary.narrative!;
};

// 합성 랩 생성기: driverNumber 가 lap 1..lastLap 를 baseMs 부터 stepMs 간격으로 시작한다.
const lapsFor = (
  driverNumber: number,
  lastLap: number,
  baseMs: number,
  stepMs: number,
): OpenF1Lap[] => {
  const laps: OpenF1Lap[] = [];

  for (let lap = 1; lap <= lastLap; lap += 1) {
    laps.push({
      driver_number: driverNumber,
      lap_number: lap,
      date_start: new Date(baseMs + (lap - 1) * stepMs).toISOString(),
      lap_duration: 90 + driverNumber,
    });
  }

  return laps;
};

const baseMeta = belgianGp.meta;

const makeData = (overrides: Partial<OpenF1SessionData>): OpenF1SessionData => ({
  meta: baseMeta,
  drivers: [
    { driver_number: 1, name_acronym: "VER", full_name: "Max Verstappen", team_name: "Red Bull" },
    { driver_number: 4, name_acronym: "NOR", full_name: "Lando Norris", team_name: "McLaren" },
    { driver_number: 7, name_acronym: "STK", full_name: "Stalled Car", team_name: "Backmarker" },
  ],
  positions: [],
  intervals: [],
  stints: [],
  laps: [],
  pits: [],
  raceControl: [],
  ...overrides,
});

describe("RaceNarrative — 합성 데이터로 필드별 조립", () => {
  it("leadChanges 는 position==1 을 시간순으로 연속 중복 제거한 시퀀스다", () => {
    const data = makeData({
      positions: [
        { date: "2026-07-19T13:00:00Z", driver_number: 1, position: 1 },
        { date: "2026-07-19T13:01:00Z", driver_number: 1, position: 1 },
        { date: "2026-07-19T13:02:00Z", driver_number: 4, position: 1 },
        { date: "2026-07-19T13:03:00Z", driver_number: 1, position: 1 },
        // nowMs 이후 선두는 빠진다.
        { date: "2026-07-19T15:00:00Z", driver_number: 4, position: 1 },
      ],
    });

    const narrative = narrativeOf(data, Date.parse("2026-07-19T14:00:00Z"));

    expect(narrative.leadChanges).toEqual([1, 4, 1]);
  });

  it("pitWaves 는 인접 랩의 피트를 묶어 대수순 상위 구간으로 준다", () => {
    const data = makeData({
      // 리더 랩을 만들려면 랩이 필요하다.
      laps: lapsFor(1, 25, Date.parse("2026-07-19T13:00:00Z"), 60_000),
      pits: [
        { driver_number: 1, lap_number: 5, date: "2026-07-19T13:05:00Z", pit_duration: 22 },
        { driver_number: 4, lap_number: 5, date: "2026-07-19T13:05:10Z", pit_duration: 22 },
        { driver_number: 7, lap_number: 6, date: "2026-07-19T13:06:00Z", pit_duration: 22 },
        { driver_number: 1, lap_number: 10, date: "2026-07-19T13:10:00Z", pit_duration: 22 },
        { driver_number: 4, lap_number: 20, date: "2026-07-19T13:20:00Z", pit_duration: 22 },
        { driver_number: 7, lap_number: 21, date: "2026-07-19T13:21:00Z", pit_duration: 22 },
        { driver_number: 1, lap_number: 21, date: "2026-07-19T13:21:10Z", pit_duration: 22 },
      ],
    });

    const narrative = narrativeOf(data, Date.parse("2026-07-19T14:00:00Z"));

    // 인접(연속) 랩 클러스터: [5-6]=3, [10]=1, [20-21]=3. 대수순 상위.
    expect(narrative.pitWaves).toContainEqual({ startLap: 5, endLap: 6, count: 3 });
    expect(narrative.pitWaves).toContainEqual({ startLap: 20, endLap: 21, count: 3 });
    expect(narrative.pitWaves).toContainEqual({ startLap: 10, endLap: 10, count: 1 });
  });

  it("6개 구간 피트 → PIT_WAVE_LIMIT(5)로 잘린다", () => {
    const data = makeData({
      laps: lapsFor(1, 30, Date.parse("2026-07-19T13:00:00Z"), 60_000),
      pits: [
        // 6개 구간: 대수 3, 2, 2, 2, 2, 1. 상위 5만 남아야 한다(count 2인 구간들이 5개).
        { driver_number: 1, lap_number: 5, date: "2026-07-19T13:05:00Z", pit_duration: 22 },
        { driver_number: 4, lap_number: 5, date: "2026-07-19T13:05:10Z", pit_duration: 22 },
        { driver_number: 7, lap_number: 5, date: "2026-07-19T13:05:20Z", pit_duration: 22 },
        { driver_number: 1, lap_number: 10, date: "2026-07-19T13:10:00Z", pit_duration: 22 },
        { driver_number: 4, lap_number: 10, date: "2026-07-19T13:10:10Z", pit_duration: 22 },
        { driver_number: 7, lap_number: 15, date: "2026-07-19T13:15:00Z", pit_duration: 22 },
        { driver_number: 11, lap_number: 15, date: "2026-07-19T13:15:10Z", pit_duration: 22 },
        { driver_number: 1, lap_number: 20, date: "2026-07-19T13:20:00Z", pit_duration: 22 },
        { driver_number: 4, lap_number: 20, date: "2026-07-19T13:20:10Z", pit_duration: 22 },
        { driver_number: 7, lap_number: 25, date: "2026-07-19T13:25:00Z", pit_duration: 22 },
        { driver_number: 11, lap_number: 25, date: "2026-07-19T13:25:10Z", pit_duration: 22 },
        { driver_number: 1, lap_number: 30, date: "2026-07-19T13:30:00Z", pit_duration: 22 },
      ],
    });

    const narrative = narrativeOf(data, Date.parse("2026-07-19T14:00:00Z"));

    // 상위 5개 구간만 담아야 한다.
    expect(narrative.pitWaves.length).toBeLessThanOrEqual(5);
    // 가장 많은 구간(3)이 포함되어야 한다.
    expect(narrative.pitWaves.some((w) => w.count === 3)).toBe(true);
  });

  it("biggestMovers 는 그리드(첫 순위) 대비 상승·하락을 각 3까지 담는다", () => {
    const data = makeData({
      laps: lapsFor(1, 10, Date.parse("2026-07-19T13:00:00Z"), 60_000),
      positions: [
        // 그리드(첫값): 1→5, 4→1
        { date: "2026-07-19T12:50:00Z", driver_number: 1, position: 5 },
        { date: "2026-07-19T12:50:00Z", driver_number: 4, position: 1 },
        // 현재: 1→1(상승 +4), 4→5(하락 -4)
        { date: "2026-07-19T13:30:00Z", driver_number: 1, position: 1 },
        { date: "2026-07-19T13:30:00Z", driver_number: 4, position: 5 },
      ],
    });

    const narrative = narrativeOf(data, Date.parse("2026-07-19T14:00:00Z"));

    expect(narrative.biggestMovers).toContainEqual({ driverNumber: 1, from: 5, to: 1, delta: 4 });
    expect(narrative.biggestMovers).toContainEqual({ driverNumber: 4, from: 1, to: 5, delta: -4 });
    expect(narrative.biggestMovers.length).toBeLessThanOrEqual(6);
  });

  it("상승 5명 합성 → MOVERS_LIMIT(3)으로 잘리고 상승폭 내림차순", () => {
    const data = makeData({
      laps: lapsFor(1, 10, Date.parse("2026-07-19T13:00:00Z"), 60_000),
      positions: [
        // 그리드: 1→10, 4→9, 7→8, 11→7, 14→6 (5명이 각각 상승할 예정)
        { date: "2026-07-19T12:50:00Z", driver_number: 1, position: 10 },
        { date: "2026-07-19T12:50:00Z", driver_number: 4, position: 9 },
        { date: "2026-07-19T12:50:00Z", driver_number: 7, position: 8 },
        { date: "2026-07-19T12:50:00Z", driver_number: 11, position: 7 },
        { date: "2026-07-19T12:50:00Z", driver_number: 14, position: 6 },
        // 현재: 1→1(+9), 4→2(+7), 7→3(+5), 11→4(+3), 14→5(+1)
        { date: "2026-07-19T13:30:00Z", driver_number: 1, position: 1 },
        { date: "2026-07-19T13:30:00Z", driver_number: 4, position: 2 },
        { date: "2026-07-19T13:30:00Z", driver_number: 7, position: 3 },
        { date: "2026-07-19T13:30:00Z", driver_number: 11, position: 4 },
        { date: "2026-07-19T13:30:00Z", driver_number: 14, position: 5 },
      ],
    });

    const narrative = narrativeOf(data, Date.parse("2026-07-19T14:00:00Z"));

    const risers = narrative.biggestMovers.filter((m) => m.delta > 0);

    // 상위 3만 담아야 한다.
    expect(risers.length).toBeLessThanOrEqual(3);
    expect(risers.length).toBeGreaterThan(0);
    // 상승폭 내림차순: +9, +7, +5 순서.
    expect(risers[0]!.delta).toBeGreaterThanOrEqual(risers[1]?.delta ?? 0);
    expect(risers[1]?.delta ?? 0).toBeGreaterThanOrEqual(risers[2]?.delta ?? 0);
  });

  it("세션 초반(랩 임계 이전)에는 biggestMovers 가 빈 배열이다", () => {
    const data = makeData({
      // 리더가 아직 2랩뿐 → 포메이션 셔플 소음 차단.
      laps: lapsFor(1, 2, Date.parse("2026-07-19T13:00:00Z"), 60_000),
      positions: [
        { date: "2026-07-19T12:50:00Z", driver_number: 1, position: 5 },
        { date: "2026-07-19T13:01:00Z", driver_number: 1, position: 1 },
      ],
    });

    const narrative = narrativeOf(data, Date.parse("2026-07-19T13:02:00Z"));

    expect(narrative.biggestMovers).toEqual([]);
  });

  it("fastestLap 은 date_start <= nowMs 인 랩만으로 최소 기록을 고른다", () => {
    const data = makeData({
      laps: [
        { driver_number: 1, lap_number: 3, date_start: "2026-07-19T13:03:00Z", lap_duration: 95 },
        { driver_number: 4, lap_number: 3, date_start: "2026-07-19T13:03:00Z", lap_duration: 92.5 },
        // nowMs 이후의 더 빠른 랩은 새면 안 된다.
        { driver_number: 1, lap_number: 40, date_start: "2026-07-19T15:00:00Z", lap_duration: 80 },
      ],
    });

    const narrative = narrativeOf(data, Date.parse("2026-07-19T14:00:00Z"));

    expect(narrative.fastestLap).toEqual({ driverNumber: 4, lapSeconds: 92.5, lap: 3 });
  });

  it("weatherShifts 는 rainfall>0 여부가 바뀌는 시점만 담는다", () => {
    const data = makeData({
      laps: lapsFor(1, 30, Date.parse("2026-07-19T13:00:00Z"), 60_000),
      weather: [
        { date: "2026-07-19T13:00:00Z", air_temperature: 20, track_temperature: 30, humidity: 50, rainfall: 0, wind_speed: 1 },
        { date: "2026-07-19T13:05:00Z", air_temperature: 20, track_temperature: 30, humidity: 50, rainfall: 0, wind_speed: 1 },
        // wet 시작 (6랩 무렵)
        { date: "2026-07-19T13:06:00Z", air_temperature: 20, track_temperature: 30, humidity: 80, rainfall: 1, wind_speed: 1 },
        { date: "2026-07-19T13:07:00Z", air_temperature: 20, track_temperature: 30, humidity: 80, rainfall: 1, wind_speed: 1 },
        // dry 복귀 (11랩 무렵)
        { date: "2026-07-19T13:11:00Z", air_temperature: 20, track_temperature: 30, humidity: 50, rainfall: 0, wind_speed: 1 },
      ],
    });

    const narrative = narrativeOf(data, Date.parse("2026-07-19T14:00:00Z"));

    expect(narrative.weatherShifts).toEqual([
      { lap: 7, toWet: true },
      { lap: 12, toWet: false },
    ]);
  });

  it("safetyCars 는 SC/VSC 개시 구간을 kind·startLap 으로 담는다", () => {
    const data = makeData({
      raceControl: [
        { date: "2026-07-19T13:05:00Z", category: "SafetyCar", flag: null, scope: null, message: "SAFETY CAR DEPLOYED", lap_number: 3 },
        { date: "2026-07-19T13:10:00Z", category: "SafetyCar", flag: null, scope: null, message: "SAFETY CAR IN THIS LAP", lap_number: 5 },
        { date: "2026-07-19T13:20:00Z", category: "SafetyCar", flag: null, scope: null, message: "VSC DEPLOYED", lap_number: 12 },
        { date: "2026-07-19T13:22:00Z", category: "SafetyCar", flag: null, scope: null, message: "VSC ENDING", lap_number: 13 },
        // nowMs 이후 개시는 빠진다.
        { date: "2026-07-19T15:00:00Z", category: "SafetyCar", flag: null, scope: null, message: "SAFETY CAR DEPLOYED", lap_number: 40 },
      ],
    });

    const narrative = narrativeOf(data, Date.parse("2026-07-19T14:00:00Z"));

    expect(narrative.safetyCars).toEqual([
      { kind: SafetyCarKind.Sc, startLap: 3 },
      { kind: SafetyCarKind.Vsc, startLap: 12 },
    ]);
  });
});

describe("RaceNarrative — 리타이어 랩 정체 감지", () => {
  // 리더 10랩, stepMs 로 랩 시각을 벌려 nowMs 안에 다 들어오게 한다.
  const baseMs = Date.parse("2026-07-19T13:00:00Z");
  const nowMs = Date.parse("2026-07-19T14:00:00Z");

  it("리더보다 크게 뒤처지고 피트 중이 아닌 차는 리타이어다", () => {
    const data = makeData({
      // #1 리더 10랩, #7 은 5랩에서 멈춤(피트 없음) → 리타이어.
      laps: [
        ...lapsFor(1, 10, baseMs, 60_000),
        ...lapsFor(7, 5, baseMs, 60_000),
      ],
    });

    const narrative = narrativeOf(data, nowMs);

    expect(narrative.retirements).toContainEqual({ driverNumber: 7, lap: 5 });
  });

  it("정체 랩에 피트한 차는 리타이어로 보지 않는다", () => {
    const data = makeData({
      laps: [
        ...lapsFor(1, 10, baseMs, 60_000),
        ...lapsFor(7, 5, baseMs, 60_000),
      ],
      // #7 이 마지막 완주 랩(5)에 피트 중 → 정지가 아니라 피트로 본다.
      pits: [
        { driver_number: 7, lap_number: 5, date: "2026-07-19T13:05:30Z", pit_duration: 25 },
      ],
    });

    const narrative = narrativeOf(data, nowMs);

    expect(narrative.retirements.find((r) => r.driverNumber === 7)).toBeUndefined();
  });

  it("1랩만 정체된 차(리더 바로 뒤)는 리타이어가 아니다", () => {
    const data = makeData({
      // #1 리더 10랩, #7 은 8랩(2랩 뒤) → K 미만이라 리타이어 아님.
      laps: [
        ...lapsFor(1, 10, baseMs, 60_000),
        ...lapsFor(7, 8, baseMs, 60_000),
      ],
    });

    const narrative = narrativeOf(data, nowMs);

    expect(narrative.retirements.find((r) => r.driverNumber === 7)).toBeUndefined();
  });
});

describe("RaceNarrative — 데이터 부족·안전성", () => {
  it("빈 데이터에서도 narrative 가 안전하게 조립된다", () => {
    const data = makeData({});

    const narrative = narrativeOf(data, Date.parse("2026-07-19T14:00:00Z"));

    expect(narrative.leadChanges).toEqual([]);
    expect(narrative.retirements).toEqual([]);
    expect(narrative.pitWaves).toEqual([]);
    expect(narrative.biggestMovers).toEqual([]);
    expect(narrative.fastestLap).toBeNull();
    expect(narrative.weatherShifts).toEqual([]);
    expect(narrative.safetyCars).toEqual([]);
  });

  it("buildLiveContextSummary 는 입력 data 를 mutate 하지 않는다", () => {
    const data = makeData({
      laps: lapsFor(1, 10, Date.parse("2026-07-19T13:00:00Z"), 60_000),
      positions: [
        { date: "2026-07-19T12:50:00Z", driver_number: 1, position: 5 },
        { date: "2026-07-19T13:30:00Z", driver_number: 1, position: 1 },
      ],
    });

    // 호출 전 상태 스냅샷.
    const lapsBefore = JSON.stringify(data.laps);
    const positionsBefore = JSON.stringify(data.positions);

    buildLiveContextSummary(data, Date.parse("2026-07-19T14:00:00Z"));

    // 호출 후 상태 확인: 변경 없음.
    expect(JSON.stringify(data.laps)).toBe(lapsBefore);
    expect(JSON.stringify(data.positions)).toBe(positionsBefore);
  });
});

describe("RaceNarrative — 벨기에 GP 회귀 (라이브 정체 감지 경로)", () => {
  it("경기 끝 시점 리타이어가 정확히 STR·PER·RUS 3명이다", () => {
    const narrative = narrativeOf(belgianGp, raceEndMs);

    // 실측: STR(#18) 26랩, PER(#11) 14랩, RUS(#63) 1랩 정지. 리더는 그 위(44~45랩).
    // 정렬: 늦게 멈춘 순(lap desc), 동률이면 번호 asc.
    expect(narrative.retirements).toEqual([
      { driverNumber: 18, lap: 26 },
      { driverNumber: 11, lap: 14 },
      { driverNumber: 63, lap: 1 },
    ]);
  });

  it("경기 끝 선두 보유 시퀀스가 실데이터와 일치한다", () => {
    const narrative = narrativeOf(belgianGp, raceEndMs);

    expect(narrative.leadChanges).toEqual([12, 3, 12, 16, 1, 16, 12]);
  });

  it("SC·VSC 개시 구간이 실데이터와 일치한다", () => {
    const narrative = narrativeOf(belgianGp, raceEndMs);

    expect(narrative.safetyCars).toEqual([
      { kind: SafetyCarKind.Sc, startLap: 1 },
      { kind: SafetyCarKind.Vsc, startLap: 18 },
      { kind: SafetyCarKind.Vsc, startLap: 20 },
    ]);
  });

  it("progress 는 리더 랩·서킷 예정 랩·세션 국면을 담는다", () => {
    const narrative = narrativeOf(belgianGp, raceEndMs);

    expect(narrative.progress.totalLaps).toBe(44);
    expect(narrative.progress.currentLap).not.toBeNull();
    expect(narrative.progress.currentLap!).toBeGreaterThanOrEqual(44);
  });

  it("progress.currentLap 은 totalLaps 로 클램프된다 (리더 45/totalLaps 44 → 44)", () => {
    // 우승자 체커 후 인랩까지 센 리더 랩이 45일 수 있다.
    const narrative = narrativeOf(belgianGp, raceEndMs);

    expect(narrative.progress.totalLaps).toBe(44);
    // 클램프: Math.min(leaderLap, totalLaps) ≤ totalLaps.
    expect(narrative.progress.currentLap).toBeLessThanOrEqual(narrative.progress.totalLaps!);
  });
});

describe("RaceNarrative — 중간 nowMs 일관성 (미래 누출 없음, 수용 기준 §9)", () => {
  it("중반 시점엔 그 뒤에 멈추는 STR 이 리타이어에 없고 이미 멈춘 PER·RUS 만 나온다", () => {
    const narrative = narrativeOf(belgianGp, midRaceMs);

    const numbers = narrative.retirements.map((r) => r.driverNumber).sort((a, b) => a - b);

    // PER(#11, 14랩 정지)·RUS(#63, 1랩 정지)만. STR(#18)은 26랩에 멈추므로 아직 달리는 중.
    expect(numbers).toEqual([11, 63]);
    expect(narrative.retirements.find((r) => r.driverNumber === 18)).toBeUndefined();
  });

  it("중반 leadChanges 는 경기 끝 시퀀스의 접두사다 (미래 선두 누출 없음)", () => {
    const midNarrative = narrativeOf(belgianGp, midRaceMs);
    const endNarrative = narrativeOf(belgianGp, raceEndMs);

    const mid = midNarrative.leadChanges;
    const end = endNarrative.leadChanges;

    expect(end.slice(0, mid.length)).toEqual(mid);
    expect(mid.length).toBeLessThan(end.length);
  });

  it("중반 fastestLap 은 그 시점 이전 랩에서만 나온다", () => {
    const narrative = narrativeOf(belgianGp, midRaceMs);

    expect(narrative.fastestLap).not.toBeNull();

    // 패스티스트 보유자의 그 랩 date_start 가 midRaceMs 이전이어야 한다.
    const holder = narrative.fastestLap!;
    const lapRow = belgianGp.laps.find(
      (lap) => lap.driver_number === holder.driverNumber && lap.lap_number === holder.lap,
    );

    expect(lapRow).toBeDefined();
    expect(parseMs(lapRow!.date_start)).toBeLessThanOrEqual(midRaceMs);
  });
});

describe("RaceNarrative — 직렬화 크기 상한 (수용 기준 §11)", () => {
  it("벨기에 GP narrative JSON 이 유계 크기다", () => {
    const narrative = narrativeOf(belgianGp, raceEndMs);

    // 캡(movers 6·pitWaves 5) + 자연 유계 필드라 최악에도 수백 토큰 예산 안이다.
    // 4KB 는 넉넉한 상한 — 회귀로 폭주를 잡는다.
    expect(JSON.stringify(narrative).length).toBeLessThan(4_000);
  });
});
