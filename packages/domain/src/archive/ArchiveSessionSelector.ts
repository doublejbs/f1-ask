import { OpenF1Meeting, OpenF1Session } from "../openf1/OpenF1Types";
import { toSessionId } from "../openf1/OpenF1Client";
import { ArchiveRaceSession } from "./ArchiveRaceTypes";

// OpenF1 의 session_type="Race" 는 그랑프리 결승과 스프린트를 모두 포함한다.
export const ARCHIVE_RACE_SESSION_TYPE = "Race";

// 세션이 끝난 직후에는 session_result 가 아직 확정되지 않을 수 있다.
// 이만큼 지난 세션만 "완료"로 보고 목록에 싣는다(캐시 대상 판정과 같은 기준이다).
export const ARCHIVE_SETTLE_MARGIN_MS = 1_800_000;

const parseMs = (value: string | null | undefined): number =>
  value === null || value === undefined ? Number.NaN : Date.parse(value);

const isCancelled = (row: { is_cancelled?: boolean | null }): boolean =>
  row.is_cancelled === true;

// 레이스를 여는 미팅을 시작 시각 순으로 세어 라운드 번호를 만든다.
// OpenF1 은 라운드를 주지 않고, 프리시즌 테스트 미팅은 레이스 세션이 없으므로
// 이 방식이면 자연히 빠진다. 스프린트와 결승은 같은 미팅이라 라운드를 공유한다.
export const buildMeetingRounds = (
  sessions: readonly OpenF1Session[],
  meetings: readonly OpenF1Meeting[],
): Map<number, number> => {
  const racingMeetingKeys = new Set(
    sessions
      .filter(
        (session) =>
          session.session_type === ARCHIVE_RACE_SESSION_TYPE &&
          !isCancelled(session),
      )
      .map((session) => session.meeting_key),
  );

  const ordered = meetings
    .filter(
      (meeting) =>
        racingMeetingKeys.has(meeting.meeting_key) && !isCancelled(meeting),
    )
    .map((meeting) => ({ meeting, atMs: parseMs(meeting.date_start) }))
    .sort((a, b) => a.atMs - b.atMs);

  const rounds = new Map<number, number>();

  ordered.forEach((entry, index) => {
    rounds.set(entry.meeting.meeting_key, index + 1);
  });

  return rounds;
};

// 완료된 레이스 세션을 최신순으로 고른다.
//
// 완료 판정은 전적으로 date_end 기준이다 — 취소된 세션과 아직 결과가 굳지 않은
// 세션(정산 여유 30분)은 제외한다. 여기서 걸러진 세션만 캐시 대상이 된다.
export const selectCompletedRaceSessions = (
  sessions: readonly OpenF1Session[],
  meetings: readonly OpenF1Meeting[],
  nowMs: number,
): ArchiveRaceSession[] => {
  const rounds = buildMeetingRounds(sessions, meetings);
  const meetingByKey = new Map(
    meetings.map((meeting) => [meeting.meeting_key, meeting]),
  );

  return sessions
    .filter((session) => session.session_type === ARCHIVE_RACE_SESSION_TYPE)
    .filter((session) => !isCancelled(session))
    .map((session) => ({ session, endMs: parseMs(session.date_end) }))
    .filter((entry) => !Number.isNaN(entry.endMs))
    .filter((entry) => entry.endMs + ARCHIVE_SETTLE_MARGIN_MS <= nowMs)
    .sort((a, b) => b.endMs - a.endMs)
    .map(({ session }) => {
      const meeting = meetingByKey.get(session.meeting_key);

      return {
        sessionKey: session.session_key,
        sessionId: toSessionId(session),
        meetingKey: session.meeting_key,
        round: rounds.get(session.meeting_key) ?? 0,
        // 미팅을 못 찾으면 서킷명으로 대체해 빈 제목이 노출되지 않게 한다.
        meetingName: meeting?.meeting_name ?? session.circuit_short_name,
        sessionName: session.session_name,
        circuitName: session.circuit_short_name,
        countryCode: session.country_code,
        countryName:
          session.country_name ?? meeting?.country_name ?? session.country_code,
        dateStart: session.date_start ?? null,
        // 위 필터가 NaN 을 걸렀으므로 여기서는 항상 문자열이다.
        dateEnd: session.date_end ?? "",
      };
    });
};

// 상세 요청이 캐시 대상인지 — 진행 중이거나 방금 끝난 세션은 캐시하지 않는다.
export const isArchivableSession = (
  session: Pick<OpenF1Session, "date_end" | "is_cancelled">,
  nowMs: number,
): boolean => {
  const endMs = parseMs(session.date_end);

  if (Number.isNaN(endMs) || isCancelled(session)) {
    return false;
  }

  return endMs + ARCHIVE_SETTLE_MARGIN_MS <= nowMs;
};
