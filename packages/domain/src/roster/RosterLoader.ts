import {
  fetchOpenF1RaceSessions,
  fetchOpenF1SeasonDrivers,
  OpenF1ClientOptions,
} from "../openf1/OpenF1Client";
import { OpenF1Session } from "../openf1/OpenF1Types";
import { buildRosterFromDrivers, RosterTeam } from "./RosterFromDrivers";

// 온보딩·VS 대문용 팀 로스터를 OpenF1 에서 로드한다 (docs 계획 §Phase 1).
//
// 가장 최근에 "시작된" Race 세션의 드라이버를 로스터의 진실로 삼는다 — 시즌 중 라인업이
// 바뀌어도 최신 상태를 따른다. 아직 시즌이 시작 전이면 첫 예정 Race 의 엔트리를 쓴다.

export type LoadRosterInput = {
  year: number;
  clientOptions?: OpenF1ClientOptions;
  nowMs: number;
};

const startedMs = (session: OpenF1Session): number | null => {
  if (!session.date_start) {
    return null;
  }

  const ms = Date.parse(session.date_start);
  return Number.isNaN(ms) ? null : ms;
};

export const loadRoster = async ({
  year,
  clientOptions = {},
  nowMs,
}: LoadRosterInput): Promise<RosterTeam[]> => {
  const sessions = (
    await fetchOpenF1RaceSessions(year, clientOptions)
  ).filter((session) => session.is_cancelled !== true);

  const dated = sessions
    .map((session) => ({ session, ms: startedMs(session) }))
    .filter((entry): entry is { session: OpenF1Session; ms: number } =>
      entry.ms !== null,
    );

  if (dated.length === 0) {
    return [];
  }

  const started = dated
    .filter((entry) => entry.ms <= nowMs)
    .sort((a, b) => b.ms - a.ms);

  // 시작된 최신 Race, 없으면 가장 이른 예정 Race.
  const pick =
    started[0]?.session ??
    [...dated].sort((a, b) => a.ms - b.ms)[0]?.session;

  if (pick === undefined) {
    return [];
  }

  // `session_key>=` 는 이후 세션까지 포함해 시즌 중 시트 교체분(예: 레드불 3번째 번호)이
  // 섞인다. 정확히 이 세션의 드라이버만 남겨 팀당 현재 2명이 되게 한다.
  const drivers = (
    await fetchOpenF1SeasonDrivers(pick.session_key, clientOptions)
  ).filter(
    (driver) =>
      driver.session_key === undefined ||
      driver.session_key === pick.session_key,
  );

  return buildRosterFromDrivers(drivers);
};
