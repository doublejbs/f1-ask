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
  label: string;
  value: string;
};

// 트랙 컨디션 위젯. 기온·노면온·습도·바람과 강수 여부를 한눈에 보여준다.
export const WeatherView = ({ dictionary, weather }: Props) => {
  const metrics: Metric[] = [
    {
      icon: <Thermometer className="h-4 w-4 text-amber-400" />,
      label: dictionary.weather.air,
      value: formatCelsius(weather.airTemperatureCelsius),
    },
    {
      icon: <Thermometer className="h-4 w-4 text-red-400" />,
      label: dictionary.weather.track,
      value: formatCelsius(weather.trackTemperatureCelsius),
    },
    {
      icon: <Droplets className="h-4 w-4 text-sky-400" />,
      label: dictionary.weather.humidity,
      value: formatPercent(weather.humidityPercent),
    },
    {
      icon: <Wind className="h-4 w-4 text-muted-foreground" />,
      label: dictionary.weather.wind,
      value: formatWind(weather.windSpeedMps),
    },
  ];

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {weather.rainfall ? (
            <>
              <CloudRain className="h-4 w-4 text-sky-400" />
              <span>{dictionary.weather.rain}</span>
            </>
          ) : (
            <>
              <Sun className="h-4 w-4 text-amber-400" />
              <span>{dictionary.weather.dry}</span>
            </>
          )}
        </div>
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-center gap-1.5">
            {metric.icon}
            <span className="text-xs text-muted-foreground">
              {metric.label}
            </span>
            <span className="text-sm font-medium tabular-nums">
              {metric.value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
