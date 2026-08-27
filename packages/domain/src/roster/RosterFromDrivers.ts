import { OpenF1Driver } from "../openf1/OpenF1Types";

// OpenF1 `drivers` 응답을 온보딩·VS 대문이 쓰는 팀별 로스터로 묶는 **순수 함수**.
//
// 정적 하드코딩 대신 실데이터를 쓰는 이유: 2026 은 번호 재배정(챔피언 #1)·신생 팀
// (Audi·Cadillac)·시즌 중 라인업 변동이 있어, 하드코딩하면 틀리기 쉽다(docs 계획).

export type RosterDriver = {
  driverNumber: number;
  code: string;
  fullName: string;
  // OpenF1 headshot. 없거나 로드 실패면 UI 가 코드 배지로 폴백한다.
  headshotUrl: string | null;
};

export type RosterTeam = {
  name: string;
  // 팀 컬러 hex(# 없음). 없으면 null — UI 기본색.
  colour: string | null;
  drivers: RosterDriver[];
};

// 같은 드라이버가 여러 세션 행으로 올 수 있다 — 번호로 접고, team_name 이 채워진 행을 선호한다.
const dedupeByNumber = (drivers: OpenF1Driver[]): OpenF1Driver[] => {
  const byNumber = new Map<number, OpenF1Driver>();

  for (const driver of drivers) {
    const existing = byNumber.get(driver.driver_number);

    if (
      existing === undefined ||
      (existing.team_name === null && driver.team_name !== null)
    ) {
      byNumber.set(driver.driver_number, driver);
    }
  }

  return [...byNumber.values()];
};

// 드라이버 행 → 팀별 로스터. 팀명·코드가 없는 행은 버린다. 팀은 이름순, 팀 내 선수는 번호순.
export const buildRosterFromDrivers = (
  drivers: OpenF1Driver[],
): RosterTeam[] => {
  const byTeam = new Map<string, RosterTeam>();

  for (const driver of dedupeByNumber(drivers)) {
    const teamName = driver.team_name;
    const code = driver.name_acronym;

    if (teamName === null || code === null) {
      continue;
    }

    const team =
      byTeam.get(teamName) ??
      ({
        name: teamName,
        colour: driver.team_colour ?? null,
        drivers: [],
      } satisfies RosterTeam);

    if (team.colour === null && driver.team_colour) {
      team.colour = driver.team_colour;
    }

    team.drivers.push({
      driverNumber: driver.driver_number,
      code,
      fullName: driver.full_name ?? code,
      headshotUrl: driver.headshot_url ?? null,
    });

    byTeam.set(teamName, team);
  }

  const teams = [...byTeam.values()];

  for (const team of teams) {
    team.drivers.sort((a, b) => a.driverNumber - b.driverNumber);
  }

  teams.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return teams;
};
