// OpenF1 의 team_name 은 "Red Bull Racing", "Haas F1 Team" 처럼 장황해서
// 순위 행처럼 폭이 좁은 자리에서 잘린다. 좁은 자리에서는 이 짧은 표기를 쓰고,
// 상세 시트(DriverDetailSheetView)처럼 공간이 충분한 곳은 원본 전체 이름을 유지한다.
//
// 키는 정규화(소문자·공백 정리)한 팀명이다. Firestore 리플레이 스냅샷에서 확인한
// 실제 값은 Alpine / Aston Martin / Audi / Cadillac / Ferrari / Haas F1 Team /
// McLaren / Mercedes / Racing Bulls / Red Bull Racing / Williams 이며,
// 과거·향후 시즌에 나올 수 있는 표기도 함께 방어적으로 넣어 둔다.
const TEAM_SHORT_NAMES: Record<string, string> = {
  "red bull racing": "Red Bull",
  "oracle red bull racing": "Red Bull",
  "racing bulls": "RB",
  "visa cash app rb": "RB",
  "aston martin": "Aston",
  "aston martin aramco": "Aston",
  "haas f1 team": "Haas",
  "moneygram haas f1 team": "Haas",
  "kick sauber": "Sauber",
  "stake f1 team kick sauber": "Sauber",
  // Mercedes / Ferrari / McLaren / Williams / Alpine / Audi / Cadillac 처럼
  // 이미 짧은 팀명은 매핑하지 않고 폴백(원본 그대로)에 맡긴다.
};

// 팀명 비교용 정규화. 대소문자와 연속 공백 차이를 흡수한다.
const normalizeTeamName = (teamName: string): string =>
  teamName.trim().toLowerCase().replace(/\s+/g, " ");

// 좁은 자리에 쓸 팀 짧은 표기. 맵에 없으면 원본을 그대로 돌려주므로
// 새 팀이 그리드에 들어와도 빈 값이 노출되지 않는다.
export const getTeamShortName = (
  teamName: string | null | undefined,
): string => {
  if (teamName === null || teamName === undefined) {
    return "";
  }

  const normalized = normalizeTeamName(teamName);
  const shortName = TEAM_SHORT_NAMES[normalized];

  if (shortName === undefined) {
    return teamName;
  }

  return shortName;
};
