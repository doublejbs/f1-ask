import { describe, expect, it } from "vitest";
import {
  buildArchiveResultRows,
  resolveArchiveResultStatus,
  selectArchivePodium,
} from "../src/archive/ArchiveResultBuilder";
import { ArchiveResultStatus } from "../src/archive/ArchiveResultStatus";
import { OpenF1Driver, OpenF1SessionResult } from "../src/openf1/OpenF1Types";

const makeResult = (
  overrides: Partial<OpenF1SessionResult> & { driver_number: number },
): OpenF1SessionResult => ({
  position: 1,
  number_of_laps: 44,
  points: 25,
  duration: 5082.479,
  gap_to_leader: 0,
  dnf: false,
  dns: false,
  dsq: false,
  ...overrides,
});

const makeDriver = (
  overrides: Partial<OpenF1Driver> & { driver_number: number },
): OpenF1Driver => ({
  name_acronym: "ANT",
  full_name: "Kimi ANTONELLI",
  team_name: "Mercedes",
  team_colour: "00D7B6",
  ...overrides,
});

describe("resolveArchiveResultStatus", () => {
  it("dsq 가 dns / dnf 표기를 덮는다", () => {
    expect(
      resolveArchiveResultStatus({ dnf: true, dns: true, dsq: true }),
    ).toBe(ArchiveResultStatus.Dsq);
    expect(
      resolveArchiveResultStatus({ dnf: true, dns: true, dsq: false }),
    ).toBe(ArchiveResultStatus.Dns);
    expect(
      resolveArchiveResultStatus({ dnf: true, dns: false, dsq: false }),
    ).toBe(ArchiveResultStatus.Dnf);
    expect(
      resolveArchiveResultStatus({ dnf: false, dns: false, dsq: false }),
    ).toBe(ArchiveResultStatus.Finished);
  });
});

describe("buildArchiveResultRows", () => {
  it("순위 오름차순으로 정렬하고 순위 없는 행을 뒤로 민다", () => {
    const rows = buildArchiveResultRows(
      [
        makeResult({ driver_number: 16, position: 2 }),
        makeResult({ driver_number: 63, position: null, dnf: true }),
        makeResult({ driver_number: 12, position: 1 }),
      ],
      [
        makeDriver({ driver_number: 16, name_acronym: "LEC" }),
        makeDriver({ driver_number: 63, name_acronym: "RUS" }),
        makeDriver({ driver_number: 12, name_acronym: "ANT" }),
      ],
    );

    expect(rows.map((row) => row.driverCode)).toEqual(["ANT", "LEC", "RUS"]);
    expect(rows[2]?.status).toBe(ArchiveResultStatus.Dnf);
  });

  it("문자열 간격은 초로 쓰지 않고 표기 그대로 남긴다", () => {
    const rows = buildArchiveResultRows(
      [
        makeResult({
          driver_number: 77,
          position: 18,
          gap_to_leader: "+1 LAP",
          duration: null,
        }),
      ],
      [makeDriver({ driver_number: 77, name_acronym: "BOT" })],
    );

    expect(rows[0]?.gapToLeaderSeconds).toBeNull();
    expect(rows[0]?.gapLabel).toBe("+1 LAP");
  });

  it("로스터에 없는 드라이버도 번호로 채워 빈 이름을 노출하지 않는다", () => {
    const rows = buildArchiveResultRows([makeResult({ driver_number: 99 })], []);

    expect(rows[0]?.driverCode).toBe("99");
    expect(rows[0]?.teamName).toBe("");
  });

  it("세션 키를 주면 해당 세션 로스터·결과만 쓴다", () => {
    const rows = buildArchiveResultRows(
      [
        makeResult({ driver_number: 12, position: 1, session_key: 11334 }),
        makeResult({ driver_number: 16, position: 1, session_key: 11326 }),
      ],
      [
        makeDriver({
          driver_number: 12,
          name_acronym: "ANT",
          session_key: 11334,
        }),
        makeDriver({
          driver_number: 12,
          name_acronym: "WRONG",
          session_key: 11326,
        }),
      ],
      11334,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.driverCode).toBe("ANT");
  });
});

describe("selectArchivePodium", () => {
  it("완주한 상위 3인만 포디움으로 본다", () => {
    const rows = buildArchiveResultRows(
      [
        makeResult({ driver_number: 12, position: 1 }),
        makeResult({ driver_number: 16, position: 2 }),
        makeResult({ driver_number: 3, position: 3, dsq: true }),
        makeResult({ driver_number: 44, position: 4 }),
      ],
      [
        makeDriver({ driver_number: 12, name_acronym: "ANT" }),
        makeDriver({ driver_number: 16, name_acronym: "LEC" }),
        makeDriver({ driver_number: 3, name_acronym: "VER" }),
        makeDriver({ driver_number: 44, name_acronym: "HAM" }),
      ],
    );

    expect(selectArchivePodium(rows).map((entry) => entry.driverCode)).toEqual([
      "ANT",
      "LEC",
    ]);
  });
});
