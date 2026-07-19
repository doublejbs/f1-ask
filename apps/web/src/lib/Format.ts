// 화면 표시용 포맷 유틸. 도메인 값 계산이 아니라 렌더링 변환만 담당한다.

export const formatLapTime = (seconds: number | null): string => {
  if (seconds === null) {
    return "—";
  }

  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;

  return `${minutes}:${rest.toFixed(3).padStart(6, "0")}`;
};

export const formatGap = (seconds: number | null): string => {
  if (seconds === null) {
    return "—";
  }

  if (seconds === 0) {
    return "—";
  }

  return `+${seconds.toFixed(3)}`;
};

export const formatPositionChange = (change: number | null): string => {
  if (change === null || change === 0) {
    return "—";
  }

  return change > 0 ? `▲${change}` : `▼${Math.abs(change)}`;
};

// 섹터 시간(초) → "23.456". 랩 타임과 달리 분 단위가 없다.
export const formatSector = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined) {
    return "—";
  }

  return seconds.toFixed(3);
};

// OpenF1 team_colour("FF8000") → CSS hex("#FF8000"). 없으면 null.
export const teamColorHex = (colour: string | null | undefined): string | null => {
  if (colour === null || colour === undefined || colour.length === 0) {
    return null;
  }

  return colour.startsWith("#") ? colour : `#${colour}`;
};

// 스피드 트랩(km/h) → "342 km/h". 없으면 "—".
export const formatSpeed = (kph: number | null | undefined): string => {
  if (kph === null || kph === undefined) {
    return "—";
  }

  return `${Math.round(kph)}`;
};
