import { TireCompoundView } from "@/components/TireCompoundView";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import { formatGap, formatLapTime, formatPositionChange } from "@/lib/Format";
import { LiveDriverState } from "@f1/domain";
import { Star } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  drivers: LiveDriverState[];
  isFavorite: (driverNumber: number) => boolean;
  onToggleFavorite: (driverNumber: number) => void;
};

const positionChangeColor = (change: number | null): string => {
  if (change === null || change === 0) {
    return "text-muted-foreground";
  }

  return change > 0 ? "text-emerald-400" : "text-red-400";
};

// 20명 드라이버 순위표.
// 순위 / 드라이버 코드 / 팀 / 선두 대비 간격 / 앞차 간격 / 타이어 + 사용 랩 /
// 최근 랩 / 피트 횟수 / 피트 상태 / 관심 드라이버 표시.
export const DriverTableView = ({
  dictionary,
  drivers,
  isFavorite,
  onToggleFavorite,
}: Props) => (
  <Card>
    <CardHeader>
      <CardTitle>{dictionary.table.title}</CardTitle>
    </CardHeader>
    <CardContent className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
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
              <th className="px-2 py-2 text-center">{dictionary.table.pit}</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((driver) => {
              const favorite = isFavorite(driver.driverNumber);

              return (
                <tr
                  key={driver.driverNumber}
                  className={cn(
                    "border-b border-border/50 transition-colors",
                    favorite && "bg-primary/10",
                    driver.retired && "opacity-50",
                  )}
                >
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(driver.driverNumber)}
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
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1 tabular-nums">
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
                  <td className="px-2 py-2 text-center tabular-nums">
                    {driver.retired ? (
                      <Badge variant="stale">{dictionary.table.retired}</Badge>
                    ) : driver.inPit ? (
                      <Badge variant="delayed">{dictionary.table.inPit}</Badge>
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
