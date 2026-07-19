import { TireCompound } from "./TireCompound";

// 드라이버 실시간 상태 (docs/02-architecture.md §8.2)
// 내부 domain 모델. OpenF1 등 외부 provider 응답 구조와 분리한다.
export type LiveDriverState = {
  driverNumber: number;
  code: string;
  fullName: string;
  teamName: string;
  position: number | null;
  startingPosition: number | null;
  positionChange: number | null;
  gapToLeaderSeconds: number | null;
  intervalToAheadSeconds: number | null;
  intervalToBehindSeconds: number | null;
  lastLapSeconds: number | null;
  personalBestLapSeconds: number | null;
  compound: TireCompound;
  tireAgeLaps: number | null;
  pitStopCount: number;
  inPit: boolean;
  retired: boolean;
  recentLapTimesSeconds: number[];
};
