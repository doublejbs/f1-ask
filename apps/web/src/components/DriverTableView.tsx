import { DriverAvatarView } from "@/components/DriverAvatarView";
import { SectorChipsView } from "@/components/SectorChipsView";
import { TireCompoundView } from "@/components/TireCompoundView";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import {
  formatGap,
  formatLapTime,
  formatPositionChange,
  formatSpeed,
  teamColorHex,
} from "@/lib/Format";
import { LiveDriverState } from "@f1/domain";
import { Star } from "lucide-react";
import { useMemo } from "react";

type Props = {
  dictionary: Dictionary;
  drivers: LiveDriverState[];
  isFavorite: (driverNumber: number) => boolean;
  onToggleFavorite: (driverNumber: number) => void;
  onSelectDriver?: (driver: LiveDriverState) => void;
};

const positionChangeColor = (change: number | null): string => {
  if (change === null || change === 0) {
    return "text-muted-foreground";
  }

  return change > 0 ? "text-emerald-400" : "text-red-400";
};

// 필드 전체 최근 랩 기준 각 섹터의 최속 시간을 구한다(퍼플 판정용).
const computeFieldBestSectors = (
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

// 20명 드라이버 순위표. 팀 컬러 액센트 · 헤드샷 · 섹터(퍼플) · 스피드 트랩을 포함한다.
export const DriverTableView = ({
  dictionary,
  drivers,
  isFavorite,
  onToggleFavorite,
  onSelectDriver,
}: Props) => {
  const fieldBestSectors = useMemo(
    () => computeFieldBestSectors(drivers),
    [drivers],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.table.title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-2 py-2" />
                <th className="px-2 py-2">{dictionary.table.position}</th>
                <th className="px-2 py-2">{dictionary.table.driver}</th>
                <th className="px-2 py-2">{dictionary.table.team}</th>
                <th className="px-2 py-2 text-right">{dictionary.table.gap}</th>
                <th className="px-2 py-2 text-right">
                  {dictionary.table.interval}
                </th>
                <th className="px-2 py-2">{dictionary.table.tire}</th>
                <th className="px-2 py-2 text-right">
                  {dictionary.table.lastLap}
                </th>
                <th className="px-2 py-2 text-right">
                  {dictionary.table.sectors}
                </th>
                <th className="px-2 py-2 text-right">
                  {dictionary.table.topSpeed}
                </th>
                <th className="px-2 py-2 text-center">{dictionary.table.pit}</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => {
                const favorite = isFavorite(driver.driverNumber);
                const accent = teamColorHex(driver.teamColour);
                const selectable = onSelectDriver !== undefined;

                return (
                  <tr
                    key={driver.driverNumber}
                    onClick={
                      selectable
                        ? () => onSelectDriver(driver)
                        : undefined
                    }
                    className={cn(
                      "border-b border-border/50 transition-colors",
                      favorite && "bg-primary/10",
                      driver.retired && "opacity-50",
                      selectable && "cursor-pointer hover:bg-muted/40",
                    )}
                  >
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(driver.driverNumber);
                        }}
                        aria-label={dictionary.table.favorite}
                        aria-pressed={favorite}
                        className="text-muted-foreground transition-colors hover:text-amber-400"
                      >
                        <Star
                          className={cn(
                            "h-4 w-4",
                            favorite && "fill-amber-400 text-amber-400",
                          )}
                        />
                      </button>
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2 tabular-nums">
                        <span
                          className="h-6 w-1 rounded-full"
                          style={{
                            backgroundColor: accent ?? "hsl(var(--border))",
                          }}
                          aria-hidden
                        />
                        <span className="w-5 font-bold">
                          {driver.position ?? "—"}
                        </span>
                        <span
                          className={cn(
                            "text-xs",
                            positionChangeColor(driver.positionChange),
                          )}
                        >
                          {formatPositionChange(driver.positionChange)}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <DriverAvatarView
                          code={driver.code}
                          headshotUrl={driver.headshotUrl}
                          teamColour={driver.teamColour}
                        />
                        <span className="font-bold">{driver.code}</span>
                        <span className="text-xs text-muted-foreground">
                          #{driver.driverNumber}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {driver.teamName}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {driver.position === 1
                        ? dictionary.table.leader
                        : formatGap(driver.gapToLeaderSeconds)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {formatGap(driver.intervalToAheadSeconds)}
                    </td>
                    <td className="px-2 py-2">
                      <TireCompoundView
                        dictionary={dictionary}
                        compound={driver.compound}
                        tireAgeLaps={driver.tireAgeLaps}
                      />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {formatLapTime(driver.lastLapSeconds)}
                    </td>
                    <td className="px-2 py-2">
                      <SectorChipsView
                        sectors={driver.lastSectorsSeconds}
                        fieldBest={fieldBestSectors}
                      />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {formatSpeed(driver.topSpeedKph)}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums">
                      {driver.retired ? (
                        <Badge variant="stale">
                          {dictionary.table.retired}
                        </Badge>
                      ) : driver.inPit ? (
                        <Badge variant="delayed">
                          {dictionary.table.inPit}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">
                          {driver.pitStopCount}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
