import { describe, expect, it } from "vitest";
import { OpenF1Driver } from "../src/openf1/OpenF1Types";
import { buildRosterFromDrivers } from "../src/roster/RosterFromDrivers";

const driver = (over: Partial<OpenF1Driver>): OpenF1Driver => ({
  driver_number: 1,
  name_acronym: "NOR",
  full_name: "Lando NORRIS",
  team_name: "McLaren",
  team_colour: "F47600",
  headshot_url: "https://media.example/nor.png",
  ...over,
});

describe("buildRosterFromDrivers", () => {
  it("팀별로 묶고, 팀 내 선수는 번호순·팀은 이름순", () => {
    const teams = buildRosterFromDrivers([
      driver({ driver_number: 81, name_acronym: "PIA", team_name: "McLaren" }),
      driver({ driver_number: 1, name_acronym: "NOR", team_name: "McLaren" }),
      driver({
        driver_number: 16,
        name_acronym: "LEC",
        team_name: "Ferrari",
        team_colour: "E8002D",
      }),
    ]);

    expect(teams.map((t) => t.name)).toEqual(["Ferrari", "McLaren"]);
    const mclaren = teams.find((t) => t.name === "McLaren");
    expect(mclaren?.drivers.map((d) => d.driverNumber)).toEqual([1, 81]);
    expect(mclaren?.colour).toBe("F47600");
  });

  it("같은 번호 중복 행은 접고, team_name 채워진 행을 선호한다", () => {
    const teams = buildRosterFromDrivers([
      driver({ driver_number: 44, name_acronym: "HAM", team_name: null }),
      driver({ driver_number: 44, name_acronym: "HAM", team_name: "Ferrari" }),
    ]);

    expect(teams).toHaveLength(1);
    expect(teams[0]?.drivers).toHaveLength(1);
    expect(teams[0]?.name).toBe("Ferrari");
  });

  it("팀명·코드 없는 행은 버리고, headshot 없으면 null", () => {
    const teams = buildRosterFromDrivers([
      driver({ driver_number: 5, name_acronym: null, team_name: "Alpine" }),
      driver({
        driver_number: 10,
        name_acronym: "GAS",
        team_name: "Alpine",
        headshot_url: null,
        full_name: null,
      }),
    ]);

    expect(teams).toHaveLength(1);
    expect(teams[0]?.drivers).toHaveLength(1);
    expect(teams[0]?.drivers[0]?.headshotUrl).toBeNull();
    // full_name 없으면 코드로 폴백.
    expect(teams[0]?.drivers[0]?.fullName).toBe("GAS");
  });
});
