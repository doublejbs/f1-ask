import { describe, expect, it } from "vitest";
import { extractDriverTags, NewsTagDriver } from "../src/news/NewsDriverTags";

const ROSTER: NewsTagDriver[] = [
  { code: "VER", fullName: "Max Verstappen" },
  { code: "NOR", fullName: "Lando NORRIS" },
  { code: "HAM", fullName: "Lewis Hamilton" },
  { code: "LEC", fullName: "Charles Leclerc" },
];

describe("extractDriverTags", () => {
  it("성으로 매칭해 코드 태그를 로스터 순서로 돌려준다", () => {
    const tags = extractDriverTags(
      "Norris beats Verstappen to win as Hamilton fades",
      ROSTER,
    );
    expect(tags).toEqual(["VER", "NOR", "HAM"]);
  });

  it("대소문자 무관, 언급 없는 드라이버는 제외", () => {
    expect(extractDriverTags("LECLERC takes pole at Monza", ROSTER)).toEqual([
      "LEC",
    ]);
  });

  it("부분 단어는 매칭하지 않는다(단어 경계)", () => {
    // "Norrisville" 같은 부분 문자열은 태그하지 않는다.
    expect(extractDriverTags("A town called Norrisville", ROSTER)).toEqual([]);
  });

  it("언급 없으면 빈 배열", () => {
    expect(extractDriverTags("FIA updates the rulebook", ROSTER)).toEqual([]);
  });
});
