import { OpenF1Driver, OpenF1SessionResult } from "../openf1/OpenF1Types";
import {
  ArchivePodiumEntry,
  ArchiveResultRow,
} from "./ArchiveRaceTypes";
import { ArchiveResultStatus } from "./ArchiveResultStatus";

export const ARCHIVE_PODIUM_SIZE = 3;

// dsq > dns > dnf 순으로 판정한다 — 실격은 미출발·리타이어 표기를 덮어야 한다.
export const resolveArchiveResultStatus = (
  result: Pick<OpenF1SessionResult, "dnf" | "dns" | "dsq">,
): ArchiveResultStatus => {
  if (result.dsq) {
    return ArchiveResultStatus.Dsq;
  }

  if (result.dns) {
    return ArchiveResultStatus.Dns;
  }

  if (result.dnf) {
    return ArchiveResultStatus.Dnf;
  }

  return ArchiveResultStatus.Finished;
};

// driver_number → 드라이버 로스터. 여러 세션을 한 번에 조회한 응답도 받을 수 있게
// sessionKey 가 주어지면 해당 세션 행을 우선한다.
const buildDriverLookup = (
  drivers: readonly OpenF1Driver[],
  sessionKey?: number,
): Map<number, OpenF1Driver> => {
  const lookup = new Map<number, OpenF1Driver>();

  for (const driver of drivers) {
    if (sessionKey !== undefined && driver.session_key !== sessionKey) {
      continue;
    }

    lookup.set(driver.driver_number, driver);
  }

  // 해당 세션 행이 하나도 없으면(단일 세션 조회라 session_key 가 없는 경우 포함)
  // 세션 구분 없이 채워 빈 이름이 노출되지 않게 한다.
  if (lookup.size === 0) {
    for (const driver of drivers) {
      lookup.set(driver.driver_number, driver);
    }
  }

  return lookup;
};

// gap_to_leader 는 숫자(초)이거나 "+1 LAP" 같은 문자열이다.
// 숫자만 초 값으로 쓰고, 문자열은 표기 그대로 남겨 랩 다운 정보를 잃지 않는다.
const parseGap = (
  value: number | string | null | undefined,
): { seconds: number | null; label: string | null } => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { seconds: value, label: null };
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return { seconds: null, label: value.trim() };
  }

  return { seconds: null, label: null };
};

// 순위 없음(미출발 등)은 항상 뒤로 민다.
const comparePosition = (a: number | null, b: number | null): number => {
  if (a === b) {
    return 0;
  }

  if (a === null) {
    return 1;
  }

  if (b === null) {
    return -1;
  }

  return a - b;
};

// session_result + drivers → 최종 순위 행. 표시 이름·팀은 drivers 에서 채운다.
export const buildArchiveResultRows = (
  results: readonly OpenF1SessionResult[],
  drivers: readonly OpenF1Driver[],
  sessionKey?: number,
): ArchiveResultRow[] => {
  const lookup = buildDriverLookup(drivers, sessionKey);

  // 시즌 전체를 한 번에 받은 응답이면 이 세션 행만 남긴다.
  // 단일 세션 조회 응답에는 session_key 가 없으므로 그대로 통과시킨다.
  const belongsToSession = (result: OpenF1SessionResult): boolean =>
    sessionKey === undefined ||
    result.session_key === undefined ||
    result.session_key === sessionKey;

  return results
    .filter(belongsToSession)
    .map((result) => {
      const driver = lookup.get(result.driver_number);
      const gap = parseGap(result.gap_to_leader);

      return {
        position: result.position ?? null,
        driverNumber: result.driver_number,
        driverCode: driver?.name_acronym ?? String(result.driver_number),
        fullName: driver?.full_name ?? String(result.driver_number),
        teamName: driver?.team_name ?? "",
        teamColour: driver?.team_colour ?? null,
        gapToLeaderSeconds: gap.seconds,
        gapLabel: gap.label,
        totalTimeSeconds: result.duration ?? null,
        lapsCompleted: result.number_of_laps ?? null,
        points: result.points ?? null,
        status: resolveArchiveResultStatus(result),
      };
    })
    .sort((a, b) => comparePosition(a.position, b.position));
};

// 완주한 상위 3인. 실격·리타이어는 포디움이 아니다.
export const selectArchivePodium = (
  rows: readonly ArchiveResultRow[],
): ArchivePodiumEntry[] =>
  rows
    .filter(
      (row) =>
        row.status === ArchiveResultStatus.Finished &&
        row.position !== null &&
        row.position >= 1 &&
        row.position <= ARCHIVE_PODIUM_SIZE,
    )
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((row) => ({
      position: row.position ?? 0,
      driverNumber: row.driverNumber,
      driverCode: row.driverCode,
      fullName: row.fullName,
      teamName: row.teamName,
      teamColour: row.teamColour,
    }));
