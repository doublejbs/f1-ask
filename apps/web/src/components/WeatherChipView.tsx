import { Card, CardContent } from "@/components/ui/Card";
import { Dictionary } from "@/i18n/Messages";
import { WeatherState } from "@f1/domain";
import { CloudRain, Droplets, Sun, Thermometer, Wind } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  dictionary: Dictionary;
  weather: WeatherState;
};

const formatCelsius = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value)}°C`;

const formatPercent = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value)}%`;

const formatWind = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : `${value.toFixed(1)} m/s`;

type Metric = {
  icon: ReactNode;
  value: string;
};

// 「지금」 탭용 날씨 컴팩트 칩. 기존 WeatherView 를 한 줄로 축약한다(라벨 생략, 아이콘+값).
export const WeatherChipView = ({ dictionary, weather }: Props) => {
  const metrics: Metric[] = [
    {
      icon: <Thermometer className="h-3.5 w-3.5 text-amber-400" />,
      value: formatCelsius(weather.airTemperatureCelsius),
    },
    {
      icon: <Thermometer className="h-3.5 w-3.5 text-red-400" />,
      value: formatCelsius(weather.trackTemperatureCelsius),
    },
    {
      icon: <Droplets className="h-3.5 w-3.5 text-sky-400" />,
      value: formatPercent(weather.humidityPercent),
    },
    {
      icon: <Wind className="h-3.5 w-3.5 text-muted-foreground" />,
      value: formatWind(weather.windSpeedMps),
    },
  ];

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold">
          {weather.rainfall ? (
            <>
              <CloudRain className="h-3.5 w-3.5 text-sky-400" />
              <span>{dictionary.weather.rain}</span>
            </>
          ) : (
            <>
              <Sun className="h-3.5 w-3.5 text-amber-400" />
              <span>{dictionary.weather.dry}</span>
            </>
          )}
        </div>
        {metrics.map((metric, index) => (
          <div key={index} className="flex items-center gap-1">
            {metric.icon}
            <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
              {metric.value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
