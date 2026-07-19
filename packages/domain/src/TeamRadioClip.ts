// 팀 라디오 무전 클립 (OpenF1 team_radio). LiveRaceSnapshot 의 optional 필드.
// recordingUrl 은 외부(F1 라이브타이밍) mp3 이며 클라이언트가 재생만 한다.
export type TeamRadioClip = {
  driverNumber: number;
  driverCode: string;
  recordingUrl: string;
  timestamp: string;
};
