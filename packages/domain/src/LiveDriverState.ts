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
  // OpenF1 확장 필드 (Mock/Replay 에서는 없을 수 있어 optional).
  teamColour?: string | null; // 팀 컬러 hex (# 없이), 예: "FF8000"
  headshotUrl?: string | null; // 드라이버 사진 URL
  lastSectorsSeconds?: (number | null)[]; // 마지막 랩 섹터 S1/S2/S3
  topSpeedKph?: number | null; // 스피드 트랩 최고속
};
