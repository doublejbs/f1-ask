import {
  fetchOpenF1DriverSeasonResults,
  fetchOpenF1RaceSessions,
  OpenF1ClientOptions,
} from "../openf1/OpenF1Client";
import { OpenF1SessionResult } from "../openf1/OpenF1Types";
import { loadRoster } from "../roster/RosterLoader";
import { computeTeammateComparison } from "./TeammateComparison";

// VS 대문이 소비하는 자기완결 페이로드 — 두 팀메이트 + 각자 시즌 지표 (docs 계획 §Phase 3).
export type TeammateVsDriver = {
  driverNumber: number;
  code: string;
  fullName: string;
  headshotUrl: string | null;
  points: number;
  wins: number;
  podiums: number;
  headToHead: number;
};

export type TeammateVs = {
  teamName: string;
  colour: string | null;
  drivers: [TeammateVsDriver, TeammateVsDriver];
};

export type LoadTeammateVsInput = {
  year: number;
  teamName: string;
  clientOptions?: OpenF1ClientOptions;
  nowMs: number;
};

const startedMs = (iso: string | null | undefined): number | null => {
  if (!iso) {
    return null;
  }

  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
};

export const loadTeammateVs = async ({
  year,
  teamName,
  clientOptions = {},
  nowMs,
}: LoadTeammateVsInput): Promise<TeammateVs | null> => {
  const teams = await loadRoster({ year, clientOptions, nowMs });
  const team = teams.find((row) => row.name === teamName);

  if (team === undefined || team.drivers.length < 2) {
    return null;
  }

  const [first, second] = team.drivers;

  if (first === undefined || second === undefined) {
    return null;
  }

  // fetchOpenF1RaceSessions(session_type=Race)는 결승("Race")과 스프린트("Sprint")를 모두 준다.
  // 완료된 것만 취해, 결승 키(우승·포디움·헤드투헤드)와 포인트 키(결승+스프린트)로 나눈다.
  const completed = (await fetchOpenF1RaceSessions(year, clientOptions)).filter(
    (session) => {
      if (session.is_cancelled === true) {
        return false;
      }

      const ms = startedMs(session.date_start);
      return ms !== null && ms < nowMs;
    },
  );

  const raceKeys = new Set(
    completed
      .filter((session) => session.session_name === "Race")
      .map((session) => session.session_key),
  );
  // 챔피언십 포인트는 스프린트도 포함한다(스프린트도 포인트를 준다).
  const pointsKeys = new Set(
    completed
      .filter(
        (session) =>
          session.session_name === "Race" || session.session_name === "Sprint",
      )
      .map((session) => session.session_key),
  );

  const splitResults = (rows: OpenF1SessionResult[]) => ({
    raceResults: rows.filter(
      (row) => row.session_key !== undefined && raceKeys.has(row.session_key),
    ),
    pointsResults: rows.filter(
      (row) => row.session_key !== undefined && pointsKeys.has(row.session_key),
    ),
  });

  let firstSplit = { raceResults: [], pointsResults: [] } as {
    raceResults: OpenF1SessionResult[];
    pointsResults: OpenF1SessionResult[];
  };
  let secondSplit = { raceResults: [], pointsResults: [] } as {
    raceResults: OpenF1SessionResult[];
    pointsResults: OpenF1SessionResult[];
  };

  if (pointsKeys.size > 0) {
    const minKey = Math.min(...completed.map((session) => session.session_key));

    const [firstRaw, secondRaw] = await Promise.all([
      fetchOpenF1DriverSeasonResults(minKey, first.driverNumber, clientOptions),
      fetchOpenF1DriverSeasonResults(minKey, second.driverNumber, clientOptions),
    ]);

    firstSplit = splitResults(firstRaw);
    secondSplit = splitResults(secondRaw);
  }

  const comparison = computeTeammateComparison(firstSplit, secondSplit);

  return {
    teamName: team.name,
    colour: team.colour,
    drivers: [
      {
        driverNumber: first.driverNumber,
        code: first.code,
        fullName: first.fullName,
        headshotUrl: first.headshotUrl,
        ...comparison.a,
      },
      {
        driverNumber: second.driverNumber,
        code: second.code,
        fullName: second.fullName,
        headshotUrl: second.headshotUrl,
        ...comparison.b,
      },
    ],
  };
};
