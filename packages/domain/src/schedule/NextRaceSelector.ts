import { OpenF1Meeting, OpenF1Session } from "../openf1/OpenF1Types";

// 다음 그랑프리(결승) 정보. 무세션 홈에서 카운트다운·대문에 쓴다 (docs 계획 §Phase 2).
export type NextRace = {
  // 그랑프리 표시명(예: "Dutch Grand Prix"). 미팅명이 없으면 서킷명으로 폴백.
  gpName: string;
  circuit: string;
  countryCode: string | null;
  countryName: string | null;
  // 결승 시작 시각(ISO). 카운트다운 기준.
  dateStartIso: string;
  // 시즌 라운드(1-based). 미팅 정렬로 도출, 불명이면 null.
  round: number | null;
};

const startedMs = (iso: string | null | undefined): number | null => {
  if (!iso) {
    return null;
  }

  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
};

// **다음 결승만** 고른다 — 퀄리·프랙티스는 물론 스프린트(session_name!=="Race")도 제외한다.
// 사용자가 원하는 건 다음 그랑프리 결승이다(docs 계획).
export const selectNextRace = (
  sessions: OpenF1Session[],
  meetings: OpenF1Meeting[],
  nowMs: number,
): NextRace | null => {
  const upcoming = sessions
    .filter(
      (session) =>
        session.is_cancelled !== true && session.session_name === "Race",
    )
    .map((session) => ({ session, ms: startedMs(session.date_start) }))
    .filter(
      (entry): entry is { session: OpenF1Session; ms: number } =>
        entry.ms !== null && entry.ms > nowMs,
    )
    .sort((a, b) => a.ms - b.ms);

  const next = upcoming[0];

  if (next === undefined) {
    return null;
  }

  const meeting = meetings.find(
    (row) => row.meeting_key === next.session.meeting_key,
  );

  // 라운드: 날짜순 미팅 목록에서의 위치.
  const orderedMeetings = meetings
    .filter((row) => startedMs(row.date_start) !== null)
    .sort((a, b) => startedMs(a.date_start)! - startedMs(b.date_start)!);
  const roundIndex = orderedMeetings.findIndex(
    (row) => row.meeting_key === next.session.meeting_key,
  );

  return {
    gpName: meeting?.meeting_name ?? next.session.circuit_short_name,
    circuit: next.session.circuit_short_name,
    countryCode: meeting?.country_code ?? next.session.country_code ?? null,
    countryName: meeting?.country_name ?? next.session.country_name ?? null,
    dateStartIso: next.session.date_start as string,
    round: roundIndex >= 0 ? roundIndex + 1 : null,
  };
};
