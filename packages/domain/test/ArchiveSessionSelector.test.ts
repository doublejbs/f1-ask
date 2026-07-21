import { describe, expect, it } from "vitest";
import {
  ARCHIVE_SETTLE_MARGIN_MS,
  buildMeetingRounds,
  isArchivableSession,
  selectCompletedRaceSessions,
} from "../src/archive/ArchiveSessionSelector";
import { OpenF1Meeting, OpenF1Session } from "../src/openf1/OpenF1Types";

const NOW_MS = Date.parse("2026-07-21T00:00:00Z");

const makeSession = (
  overrides: Partial<OpenF1Session> & { session_key: number },
): OpenF1Session => ({
  meeting_key: 1000 + overrides.session_key,
  session_name: "Race",
  session_type: "Race",
  circuit_short_name: "Circuit",
  country_code: "BEL",
  country_name: "Belgium",
  year: 2026,
  date_start: "2026-01-01T12:00:00+00:00",
  date_end: "2026-01-01T14:00:00+00:00",
  ...overrides,
});

const makeMeeting = (
  overrides: Partial<OpenF1Meeting> & { meeting_key: number },
): OpenF1Meeting => ({
  meeting_name: "Some Grand Prix",
  country_code: "BEL",
  country_name: "Belgium",
  circuit_short_name: "Circuit",
  date_start: "2026-01-01T09:00:00+00:00",
  year: 2026,
  ...overrides,
});

describe("selectCompletedRaceSessions", () => {
  it("완료된 레이스만 최신순으로 고른다", () => {
    const sessions = [
      makeSession({
        session_key: 1,
        meeting_key: 10,
        date_end: "2026-03-08T06:00:00+00:00",
      }),
      makeSession({
        session_key: 2,
        meeting_key: 20,
        date_end: "2026-07-19T15:00:00+00:00",
      }),
      // 아직 열리지 않은 세션.
      makeSession({
        session_key: 3,
        meeting_key: 30,
        date_end: "2026-08-02T15:00:00+00:00",
      }),
    ];
    const meetings = [
      makeMeeting({ meeting_key: 10, date_start: "2026-03-06T00:00:00+00:00" }),
      makeMeeting({ meeting_key: 20, date_start: "2026-07-17T00:00:00+00:00" }),
      makeMeeting({ meeting_key: 30, date_start: "2026-07-31T00:00:00+00:00" }),
    ];

    const selected = selectCompletedRaceSessions(sessions, meetings, NOW_MS);

    expect(selected.map((entry) => entry.sessionKey)).toEqual([2, 1]);
  });

  it("취소된 세션은 제외한다", () => {
    const sessions = [
      makeSession({ session_key: 1, meeting_key: 10 }),
      makeSession({ session_key: 2, meeting_key: 20, is_cancelled: true }),
    ];

    const selected = selectCompletedRaceSessions(
      sessions,
      [makeMeeting({ meeting_key: 10 }), makeMeeting({ meeting_key: 20 })],
      NOW_MS,
    );

    expect(selected.map((entry) => entry.sessionKey)).toEqual([1]);
  });

  it("레이스가 아닌 세션 유형은 제외한다", () => {
    const sessions = [
      makeSession({ session_key: 1, session_type: "Qualifying" }),
      makeSession({ session_key: 2, session_type: "Practice" }),
    ];

    expect(selectCompletedRaceSessions(sessions, [], NOW_MS)).toEqual([]);
  });

  it("방금 끝난 세션은 결과가 굳을 때까지 제외한다", () => {
    const justEndedMs = NOW_MS - 60_000;
    const sessions = [
      makeSession({
        session_key: 1,
        date_end: new Date(justEndedMs).toISOString(),
      }),
    ];

    expect(selectCompletedRaceSessions(sessions, [], NOW_MS)).toEqual([]);

    const settledMs = NOW_MS - ARCHIVE_SETTLE_MARGIN_MS - 1000;
    const settled = [
      makeSession({
        session_key: 1,
        date_end: new Date(settledMs).toISOString(),
      }),
    ];

    expect(
      selectCompletedRaceSessions(settled, [], NOW_MS).map(
        (entry) => entry.sessionKey,
      ),
    ).toEqual([1]);
  });

  it("date_end 가 없는 세션은 완료로 보지 않는다", () => {
    const sessions = [makeSession({ session_key: 1, date_end: null })];

    expect(selectCompletedRaceSessions(sessions, [], NOW_MS)).toEqual([]);
  });

  it("미팅명과 라운드를 붙인다", () => {
    const sessions = [
      makeSession({
        session_key: 1,
        meeting_key: 10,
        date_end: "2026-03-08T06:00:00+00:00",
      }),
      makeSession({
        session_key: 2,
        meeting_key: 20,
        date_end: "2026-07-19T15:00:00+00:00",
      }),
    ];
    const meetings = [
      makeMeeting({
        meeting_key: 10,
        meeting_name: "Australian Grand Prix",
        date_start: "2026-03-06T00:00:00+00:00",
      }),
      makeMeeting({
        meeting_key: 20,
        meeting_name: "Belgian Grand Prix",
        date_start: "2026-07-17T00:00:00+00:00",
      }),
    ];

    const selected = selectCompletedRaceSessions(sessions, meetings, NOW_MS);

    expect(selected[0]?.meetingName).toBe("Belgian Grand Prix");
    expect(selected[0]?.round).toBe(2);
    expect(selected[1]?.meetingName).toBe("Australian Grand Prix");
    expect(selected[1]?.round).toBe(1);
  });

  it("미팅을 못 찾으면 서킷명으로 대체한다", () => {
    const sessions = [
      makeSession({
        session_key: 1,
        meeting_key: 10,
        circuit_short_name: "Spa-Francorchamps",
      }),
    ];

    const selected = selectCompletedRaceSessions(sessions, [], NOW_MS);

    expect(selected[0]?.meetingName).toBe("Spa-Francorchamps");
    expect(selected[0]?.round).toBe(0);
  });
});

describe("buildMeetingRounds", () => {
  it("레이스를 여는 미팅만 시작 시각 순으로 센다", () => {
    // 프리시즌 테스트 미팅(999)은 레이스 세션이 없어 라운드에서 빠져야 한다.
    const sessions = [
      makeSession({ session_key: 1, meeting_key: 20 }),
      makeSession({ session_key: 2, meeting_key: 10 }),
    ];
    const meetings = [
      makeMeeting({
        meeting_key: 999,
        meeting_name: "Pre-Season Testing",
        date_start: "2026-02-11T07:00:00+00:00",
      }),
      makeMeeting({ meeting_key: 20, date_start: "2026-07-17T00:00:00+00:00" }),
      makeMeeting({ meeting_key: 10, date_start: "2026-03-06T00:00:00+00:00" }),
    ];

    const rounds = buildMeetingRounds(sessions, meetings);

    expect(rounds.get(10)).toBe(1);
    expect(rounds.get(20)).toBe(2);
    expect(rounds.has(999)).toBe(false);
  });

  it("스프린트와 결승은 같은 미팅이라 라운드를 공유한다", () => {
    const sessions = [
      makeSession({ session_key: 1, meeting_key: 10, session_name: "Sprint" }),
      makeSession({ session_key: 2, meeting_key: 10, session_name: "Race" }),
    ];
    const meetings = [makeMeeting({ meeting_key: 10 })];

    const rounds = buildMeetingRounds(sessions, meetings);

    expect(rounds.get(10)).toBe(1);
    expect(rounds.size).toBe(1);
  });
});

describe("isArchivableSession", () => {
  it("정산 여유가 지난 세션만 캐시 대상이다", () => {
    expect(
      isArchivableSession(
        { date_end: new Date(NOW_MS - 60_000).toISOString() },
        NOW_MS,
      ),
    ).toBe(false);

    expect(
      isArchivableSession(
        {
          date_end: new Date(
            NOW_MS - ARCHIVE_SETTLE_MARGIN_MS - 1000,
          ).toISOString(),
        },
        NOW_MS,
      ),
    ).toBe(true);
  });

  it("취소되거나 종료 시각이 없으면 캐시하지 않는다", () => {
    expect(isArchivableSession({ date_end: null }, NOW_MS)).toBe(false);
    expect(
      isArchivableSession(
        { date_end: "2026-01-01T00:00:00+00:00", is_cancelled: true },
        NOW_MS,
      ),
    ).toBe(false);
  });
});
