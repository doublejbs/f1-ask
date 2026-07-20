import { TeamRadioClip } from "@f1/domain";

// "최근 무전" 강조 시간창. 이 안에 들어온 클립은 순위 행 아이콘을 액센트로 강조한다.
export const RECENT_TEAM_RADIO_WINDOW_MS = 2 * 60 * 1000;

// 상세 시트에 표시할 드라이버별 클립 상한.
export const MAX_TEAM_RADIO_CLIPS_IN_SHEET = 5;

// ISO 문자열을 ms 로. 파싱 실패는 null 로 돌려 호출부가 판단하게 한다.
export const parseTimestampMs = (timestamp: string): number | null => {
  const ms = Date.parse(timestamp);

  if (Number.isNaN(ms)) {
    return null;
  }

  return ms;
};

// 드라이버 번호 → 클립 목록(최신순). 원본 배열은 변경하지 않는다.
export const groupTeamRadiosByDriver = (
  clips: TeamRadioClip[],
): Map<number, TeamRadioClip[]> => {
  const grouped = new Map<number, TeamRadioClip[]>();

  for (const clip of clips) {
    const entries = grouped.get(clip.driverNumber);

    if (entries === undefined) {
      grouped.set(clip.driverNumber, [clip]);
    } else {
      entries.push(clip);
    }
  }

  for (const entries of grouped.values()) {
    entries.sort(
      (left, right) =>
        (parseTimestampMs(right.timestamp) ?? 0) -
        (parseTimestampMs(left.timestamp) ?? 0),
    );
  }

  return grouped;
};

// 최근 무전 판정. referenceMs 는 경기 시계(snapshot.sourceUpdatedAt) 기준이라
// 리플레이(과거 경기 타임스탬프)에서도 올바르게 동작한다.
export const isRecentTeamRadio = (
  timestamp: string,
  referenceMs: number,
): boolean => {
  const ms = parseTimestampMs(timestamp);

  if (ms === null) {
    return false;
  }

  return Math.abs(referenceMs - ms) <= RECENT_TEAM_RADIO_WINDOW_MS;
};

// 무전 시각 라벨 "HH:MM". 파싱 실패면 빈 문자열.
export const formatRadioClock = (timestamp: string): string => {
  const ms = parseTimestampMs(timestamp);

  if (ms === null) {
    return "";
  }

  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};
