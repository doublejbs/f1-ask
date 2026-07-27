import { buildOpenF1LiveFrame, OpenF1SessionData } from "@f1/domain";
import { describe, expect, it } from "vitest";
import { parseLiveRaceSnapshot } from "../src/RaceSnapshotSchema";

// OpenF1 경계 null 방어의 **진짜 판정 기준**.
//
// 정규화가 "예외를 던지지 않는다"는 것만으로는 부족하다. 스냅샷은 Firestore 에 쓰인 뒤
// 클라이언트의 onSnapshot 콜백 안에서 parseLiveRaceSnapshot 으로 파싱되고
// (apps/web/src/firebase/FirestoreLiveRaceRepository.ts), /api/ask · /api/commentary ·
// /api/summary 도 같은 스키마를 쓴다. code / fullName / teamName 은 z.string().min(1),
// recordingUrl 은 z.string().url() 이라 **빈 문자열 폴백은 여기서 그대로 터진다** —
// 워커 크래시를 클라이언트 크래시로 옮길 뿐이다.
//
// 그래서 이 파일은 "null 이 섞인 원본으로 만든 스냅샷이 zod 를 통과하는가"만 본다.
// (도메인 쪽 동작 단언은 packages/domain/test/OpenF1NullBoundary.test.ts 에 있다.
//  @f1/schemas → @f1/domain 의존 방향 때문에 zod 단언은 이쪽에만 둘 수 있다.)

const T0 = Date.parse("2026-07-22T13:00:00.000Z");
const at = (seconds: number): string =>
  new Date(T0 + seconds * 1000).toISOString();

// 실측 헝가리 GP 랩 40 축소 재현 + drivers/team_radio 문자열 null.
const nullHeavyData = (): OpenF1SessionData => ({
  meta: {
    sessionId: "2026-hun-race",
    sessionKey: 9999,
    meetingKey: 8888,
    sessionName: "Hungarian Grand Prix — Race",
    sessionType: "Race",
    circuitName: "Hungaroring",
    countryCode: "HUN",
  },
  drivers: [
    {
      driver_number: 1,
      name_acronym: "VER",
      full_name: "Max Verstappen",
      team_name: "Red Bull Racing",
    },
    // name_acronym / full_name / team_name 이 통째로 빈 행.
    {
      driver_number: 55,
      name_acronym: null,
      full_name: null,
      team_name: null,
    },
    // 공백만 들어온 행도 min(1) 은 통과하지만 화면에서는 빈 칸이라 같이 막는다.
    {
      driver_number: 63,
      name_acronym: "   ",
      full_name: "  ",
      team_name: " ",
    },
  ],
  positions: [
    { date: at(0), driver_number: 1, position: 1 },
    { date: at(0), driver_number: 55, position: 2 },
    { date: at(0), driver_number: 63, position: 3 },
  ],
  intervals: [
    { date: at(0), driver_number: 1, gap_to_leader: 0, interval: 0 },
    { date: at(0), driver_number: 55, gap_to_leader: 2.4, interval: 2.4 },
    { date: at(0), driver_number: 63, gap_to_leader: 5.2, interval: 2.8 },
  ],
  stints: [
    {
      driver_number: 1,
      lap_start: 1,
      lap_end: 39,
      compound: "MEDIUM",
      tyre_age_at_start: 0,
    },
    // 워커를 30 분 죽인 그 행.
    {
      driver_number: 1,
      lap_start: 40,
      lap_end: 56,
      compound: null,
      tyre_age_at_start: 0,
    },
    {
      driver_number: 55,
      lap_start: 1,
      lap_end: 56,
      compound: "SOFT",
      tyre_age_at_start: 0,
    },
    {
      driver_number: 63,
      lap_start: 1,
      lap_end: 56,
      compound: "HARD",
      tyre_age_at_start: 0,
    },
  ],
  laps: [
    { driver_number: 1, lap_number: 39, date_start: at(0), lap_duration: 80 },
    { driver_number: 1, lap_number: 40, date_start: at(80), lap_duration: 95 },
    { driver_number: 55, lap_number: 40, date_start: at(80), lap_duration: 79.9 },
    { driver_number: 63, lap_number: 40, date_start: at(80), lap_duration: 80.4 },
  ],
  pits: [{ date: at(80), driver_number: 1, lap_number: 40, pit_duration: 22 }],
  raceControl: [
    {
      date: at(0),
      category: "Flag",
      flag: "GREEN",
      scope: "Track",
      message: "GREEN LIGHT - PIT EXIT OPEN",
    },
    // 문구가 없는 행.
    {
      date: at(10),
      category: "SafetyCar",
      flag: null,
      scope: null,
      message: null,
    },
  ],
  teamRadio: [
    { date: at(30), driver_number: 1, recording_url: null },
    { date: at(35), driver_number: 63, recording_url: "   " },
    { date: at(40), driver_number: 55, recording_url: "not-a-url" },
    {
      date: at(45),
      driver_number: 1,
      recording_url: "https://livetiming.example/1.mp3",
    },
  ],
});

describe("OpenF1 null 원본으로 만든 스냅샷", () => {
  const frame = buildOpenF1LiveFrame(nullHeavyData(), {
    startMs: T0,
    nowMs: T0 + 120_000,
  });

  it("parseLiveRaceSnapshot(zod) 을 통과한다", () => {
    expect(() => parseLiveRaceSnapshot(frame.snapshot)).not.toThrow();
  });

  it("code / fullName / teamName 이 어느 것도 비어 있지 않다", () => {
    const parsed = parseLiveRaceSnapshot(frame.snapshot);

    for (const driver of parsed.drivers) {
      expect(driver.code.trim()).not.toBe("");
      expect(driver.fullName.trim()).not.toBe("");
      expect(driver.teamName.trim()).not.toBe("");
    }
  });

  it("코드가 빈 드라이버는 번호 문자열로 채워진다", () => {
    const parsed = parseLiveRaceSnapshot(frame.snapshot);
    const blank = parsed.drivers.find((driver) => driver.driverNumber === 55);
    const spaces = parsed.drivers.find((driver) => driver.driverNumber === 63);

    expect(blank?.code).toBe("55");
    expect(spaces?.code).toBe("63");
  });

  it("재생 불가한 팀 라디오는 남지 않는다", () => {
    const parsed = parseLiveRaceSnapshot(frame.snapshot);

    expect(parsed.teamRadios).toHaveLength(1);
    expect(parsed.teamRadios?.[0]?.recordingUrl).toBe(
      "https://livetiming.example/1.mp3",
    );
    expect(parsed.teamRadios?.[0]?.driverCode).toBe("VER");
  });
});
