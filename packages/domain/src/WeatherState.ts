// 날씨 상태. LiveRaceSnapshot 의 optional 필드.
// (docs/02-architecture.md §8.1 에서 참조되나 상세 미정의 → MVP 최소 정의)
export type WeatherState = {
  airTemperatureCelsius: number | null;
  trackTemperatureCelsius: number | null;
  humidityPercent: number | null;
  rainfall: boolean;
};
