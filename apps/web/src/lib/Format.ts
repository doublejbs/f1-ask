// 화면 표시용 포맷 유틸. 도메인 값 계산이 아니라 렌더링 변환만 담당한다.

import { LiveDriverState } from "@f1/domain";

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

// 포지션 등락 색상. 상승은 초록, 하락은 빨강, 변동 없음·미정은 중립.
export const getPositionChangeColor = (change: number | null): string => {
  if (change === null || change === 0) {
    return "text-muted-foreground";
  }

  return change > 0 ? "text-emerald-400" : "text-red-400";
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

// 필드 전체 최근 랩 기준 각 섹터의 최속 시간을 구한다(퍼플 판정용).
export const computeFieldBestSectors = (
  drivers: LiveDriverState[],
): (number | null)[] => {
  const best: (number | null)[] = [null, null, null];

  for (const driver of drivers) {
    const sectors = driver.lastSectorsSeconds;

    if (sectors === undefined) {
      continue;
    }

    for (let i = 0; i < 3; i += 1) {
      const value = sectors[i] ?? null;

      if (value === null) {
        continue;
      }

      const current = best[i];

      if (current === null || current === undefined || value < current) {
        best[i] = value;
      }
    }
  }

  return best;
};
