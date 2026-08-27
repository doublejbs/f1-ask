import { describe, expect, it } from "vitest";
import {
  OpenF1Meeting,
  OpenF1Session,
} from "../src/openf1/OpenF1Types";
import { selectNextRace } from "../src/schedule/NextRaceSelector";

const session = (over: Partial<OpenF1Session>): OpenF1Session => ({
  session_key: 1,
  meeting_key: 1,
  session_name: "Race",
  session_type: "Race",
  circuit_short_name: "Zandvoort",
  country_code: "NLD",
  year: 2026,
  date_start: "2026-08-30T13:00:00+00:00",
  ...over,
});

const meeting = (over: Partial<OpenF1Meeting>): OpenF1Meeting => ({
  meeting_key: 1,
  meeting_name: "Dutch Grand Prix",
  country_code: "NLD",
  country_name: "Netherlands",
  circuit_short_name: "Zandvoort",
  year: 2026,
  date_start: "2026-08-28T00:00:00+00:00",
  ...over,
});

const NOW = Date.parse("2026-08-24T10:00:00+00:00");

describe("selectNextRace", () => {
  it("가장 이른 예정 결승을 고르고 미팅명·라운드를 붙인다", () => {
    const sessions = [
      session({ session_key: 10, meeting_key: 2, date_start: "2026-09-06T13:00:00+00:00" }),
      session({ session_key: 9, meeting_key: 1, date_start: "2026-08-30T13:00:00+00:00" }),
    ];
    const meetings = [
      meeting({ meeting_key: 1, date_start: "2026-08-28T00:00:00+00:00" }),
      meeting({ meeting_key: 2, meeting_name: "Italian Grand Prix", date_start: "2026-09-04T00:00:00+00:00" }),
    ];

    const next = selectNextRace(sessions, meetings, NOW);

    expect(next?.gpName).toBe("Dutch Grand Prix");
    expect(next?.dateStartIso).toBe("2026-08-30T13:00:00+00:00");
    expect(next?.round).toBe(1);
  });

  it("스프린트(session_name!=Race)·취소·과거는 제외한다", () => {
    const sessions = [
      session({ session_key: 1, session_name: "Sprint", date_start: "2026-08-29T13:00:00+00:00" }),
      session({ session_key: 2, is_cancelled: true, date_start: "2026-08-30T13:00:00+00:00" }),
      session({ session_key: 3, date_start: "2026-08-01T13:00:00+00:00" }), // 과거
      session({ session_key: 4, meeting_key: 2, date_start: "2026-09-06T13:00:00+00:00" }),
    ];
    const meetings = [meeting({ meeting_key: 2, meeting_name: "Italian Grand Prix" })];

    const next = selectNextRace(sessions, meetings, NOW);

    expect(next?.dateStartIso).toBe("2026-09-06T13:00:00+00:00");
    expect(next?.gpName).toBe("Italian Grand Prix");
  });

  it("예정 결승이 없으면 null", () => {
    const sessions = [session({ date_start: "2026-01-01T00:00:00+00:00" })];
    expect(selectNextRace(sessions, [], NOW)).toBeNull();
  });
});
