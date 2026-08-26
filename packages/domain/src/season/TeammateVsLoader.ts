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

  // 완료된 결승 세션(스프린트·퀄리·프랙티스 제외).
  const completedRaces = (await fetchOpenF1RaceSessions(year, clientOptions)).filter(
    (session) => {
      if (session.session_name !== "Race" || session.is_cancelled === true) {
        return false;
      }

      const ms = startedMs(session.date_start);
      return ms !== null && ms < nowMs;
    },
  );

  const raceKeys = new Set(completedRaces.map((session) => session.session_key));

  let firstResults: OpenF1SessionResult[] = [];
  let secondResults: OpenF1SessionResult[] = [];

  if (raceKeys.size > 0) {
    const minKey = Math.min(
      ...completedRaces.map((session) => session.session_key),
    );
    const inRace = (result: OpenF1SessionResult): boolean =>
      result.session_key !== undefined && raceKeys.has(result.session_key);

    const [firstRaw, secondRaw] = await Promise.all([
      fetchOpenF1DriverSeasonResults(minKey, first.driverNumber, clientOptions),
      fetchOpenF1DriverSeasonResults(minKey, second.driverNumber, clientOptions),
    ]);

    firstResults = firstRaw.filter(inRace);
    secondResults = secondRaw.filter(inRace);
  }

  const comparison = computeTeammateComparison(firstResults, secondResults);

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
