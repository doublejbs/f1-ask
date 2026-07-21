import { describe, expect, it } from "vitest";
import {
  diffFavoriteDrivers,
  favoriteDriverPaths,
  isFavoriteDriverNumber,
  mergeFavoriteDrivers,
  normalizeFavoriteDrivers,
  parseFavoriteDriverDocId,
  toFavoriteDriverDocId,
} from "../src/FavoriteDriverSync";

describe("favoriteDriverPaths", () => {
  it("규칙이 보호하는 users/{uid}/favoriteDrivers 경로를 만든다", () => {
    expect(favoriteDriverPaths.collection("uid-1")).toBe(
      "users/uid-1/favoriteDrivers",
    );
    expect(favoriteDriverPaths.doc("uid-1", 44)).toBe(
      "users/uid-1/favoriteDrivers/44",
    );
  });
});

describe("isFavoriteDriverNumber", () => {
  it("양의 정수만 허용한다", () => {
    expect(isFavoriteDriverNumber(1)).toBe(true);
    expect(isFavoriteDriverNumber(0)).toBe(false);
    expect(isFavoriteDriverNumber(-4)).toBe(false);
    expect(isFavoriteDriverNumber(4.5)).toBe(false);
    expect(isFavoriteDriverNumber("4")).toBe(false);
    expect(isFavoriteDriverNumber(null)).toBe(false);
    expect(isFavoriteDriverNumber(undefined)).toBe(false);
    expect(isFavoriteDriverNumber(Number.NaN)).toBe(false);
  });
});

describe("toFavoriteDriverDocId / parseFavoriteDriverDocId", () => {
  it("드라이버 번호와 문서 id 를 왕복 변환한다", () => {
    expect(toFavoriteDriverDocId(81)).toBe("81");
    expect(parseFavoriteDriverDocId("81")).toBe(81);
  });

  it("유효하지 않은 문서 id 는 null 이다", () => {
    expect(parseFavoriteDriverDocId("")).toBeNull();
    expect(parseFavoriteDriverDocId("0")).toBeNull();
    expect(parseFavoriteDriverDocId("07")).toBeNull();
    expect(parseFavoriteDriverDocId("-1")).toBeNull();
    expect(parseFavoriteDriverDocId("4.5")).toBeNull();
    expect(parseFavoriteDriverDocId("VER")).toBeNull();
  });
});

describe("normalizeFavoriteDrivers", () => {
  it("중복을 제거하고 오름차순으로 정렬한다", () => {
    expect(normalizeFavoriteDrivers([44, 1, 44, 81])).toEqual([1, 44, 81]);
  });

  it("유효하지 않은 값을 버린다", () => {
    expect(
      normalizeFavoriteDrivers([44, "16", null, undefined, -1, 0, 1.5, 63]),
    ).toEqual([44, 63]);
  });

  it("빈 입력은 빈 배열이다", () => {
    expect(normalizeFavoriteDrivers([])).toEqual([]);
  });
});

describe("mergeFavoriteDrivers", () => {
  it("로컬에만 있으면 그대로 살린다", () => {
    expect(mergeFavoriteDrivers([44, 1], [])).toEqual([1, 44]);
  });

  it("서버에만 있으면 그대로 쓴다", () => {
    expect(mergeFavoriteDrivers([], [16, 81])).toEqual([16, 81]);
  });

  it("양쪽에 있으면 합집합으로 병합한다", () => {
    expect(mergeFavoriteDrivers([44, 1], [1, 81])).toEqual([1, 44, 81]);
  });

  it("어느 쪽도 버리지 않는다 — 교집합/차집합이 아니다", () => {
    const merged = mergeFavoriteDrivers([4], [63]);

    expect(merged).toContain(4);
    expect(merged).toContain(63);
  });

  it("양쪽의 잘못된 값은 걸러낸다", () => {
    expect(mergeFavoriteDrivers([44, "x"], [null, 16])).toEqual([16, 44]);
  });

  it("입력 배열을 변경하지 않는다", () => {
    const local = [44];
    const remote = [16];

    mergeFavoriteDrivers(local, remote);

    expect(local).toEqual([44]);
    expect(remote).toEqual([16]);
  });
});

describe("diffFavoriteDrivers", () => {
  it("추가·삭제를 계산한다", () => {
    expect(diffFavoriteDrivers([1, 44], [44, 81])).toEqual({
      added: [81],
      removed: [1],
    });
  });

  it("같으면 변경이 없다", () => {
    expect(diffFavoriteDrivers([44, 1], [1, 44])).toEqual({
      added: [],
      removed: [],
    });
  });

  it("병합 업로드는 서버에 없는 값만 추가로 계산한다", () => {
    const remote = [16];
    const merged = mergeFavoriteDrivers([44, 16], remote);

    expect(diffFavoriteDrivers(remote, merged)).toEqual({
      added: [44],
      removed: [],
    });
  });
});
