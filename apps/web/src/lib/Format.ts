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
