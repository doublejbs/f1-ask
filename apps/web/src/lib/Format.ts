// 화면 표시용 포맷 유틸. 도메인 값 계산이 아니라 렌더링 변환만 담당한다.

import { LiveDriverState, SupportedLocale } from "@f1/domain";

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

// 소수 자리를 떼는 갭 크기 기준. 100초 이상은 정수로 적어 행 폭을 지킨다.
const COMPACT_GAP_INTEGER_THRESHOLD = 100;

// 모바일 순위 목록 전용 축약 갭. 소수 1자리로 폭을 줄여 팀명 자리를 확보한다.
// 상세 시트·데스크톱 테이블은 3자리를 쓰는 formatGap 을 그대로 쓴다.
export const formatGapCompact = (seconds: number | null): string => {
  if (seconds === null) {
    return "—";
  }

  if (seconds === 0) {
    return "—";
  }

  if (Math.abs(seconds) >= COMPACT_GAP_INTEGER_THRESHOLD) {
    return `+${seconds.toFixed(0)}`;
  }

  return `+${seconds.toFixed(1)}`;
};

// 배틀 간격(초) → "0.6". 순위 행의 앞차 간격 강조 수치와 접근성 문구가 같은 표기를 쓴다.
export const formatBattleGapSeconds = (seconds: number): string =>
  seconds.toFixed(1);

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

// 아카이브 목록·상세의 날짜 표기. 로케일별 짧은 형식으로 행 폭을 지킨다.
export const formatRaceDate = (iso: string, locale: SupportedLocale): string => {
  const parsed = Date.parse(iso);

  if (Number.isNaN(parsed)) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(parsed));
};

// 최종 순위의 갭 표기. 숫자면 초, 랩 다운이면 OpenF1 원문("+1 LAP")을 그대로 쓴다.
export const formatArchiveGap = (
  seconds: number | null,
  label: string | null,
  isLeader: boolean,
): string => {
  if (isLeader) {
    return "—";
  }

  if (label !== null) {
    return label;
  }

  if (seconds === null || seconds === 0) {
    return "—";
  }

  return `+${seconds.toFixed(3)}`;
};

// 총 주행 시간 5082.479 → "1:24:42.479". 우승자 행에만 쓴다.
export const formatRaceDuration = (seconds: number | null): string => {
  if (seconds === null || !Number.isFinite(seconds)) {
    return "—";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds - hours * 3600) / 60);
  const rest = seconds - hours * 3600 - minutes * 60;
  const restText = rest.toFixed(3).padStart(6, "0");

  if (hours === 0) {
    return `${minutes}:${restText}`;
  }

  return `${hours}:${String(minutes).padStart(2, "0")}:${restText}`;
};
