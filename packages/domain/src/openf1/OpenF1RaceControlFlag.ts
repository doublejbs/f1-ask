// OpenF1 race_control 응답의 flag 필드 값.
// 실측 분포: null 43 / CLEAR 42 / DOUBLE YELLOW 30 / BLUE 21 / YELLOW 12 / GREEN 2 / CHEQUERED 1.
// RED 는 실측 세션에 없었으나 적기 상황에서 관측되므로 유지한다.
export enum OpenF1RaceControlFlag {
  Clear = "CLEAR",
  Yellow = "YELLOW",
  DoubleYellow = "DOUBLE YELLOW",
  Blue = "BLUE",
  Green = "GREEN",
  Chequered = "CHEQUERED",
  Red = "RED",
}
