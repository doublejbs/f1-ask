import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dictionary } from "@/i18n/Messages";
import { LiveDriverState } from "@f1/domain";
import { RaceSummaryResponse } from "@f1/schemas";
import { Trophy } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  summary: RaceSummaryResponse;
  drivers: LiveDriverState[];
};

type StatProps = {
  label: string;
  value: string;
};

const Stat = ({ label, value }: StatProps) => (
  <div className="flex flex-col rounded-md bg-muted/40 px-3 py-2">
    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
    <span className="text-sm font-semibold tabular-nums">{value}</span>
  </div>
);

// 경기 종료 요약 카드 (PRD §6). 결정론적 사실 + AI 서술.
export const RaceSummaryView = ({ dictionary, summary, drivers }: Props) => {
  const codeOf = (driverNumber: number | null): string => {
    if (driverNumber === null) {
      return "—";
    }

    return (
      drivers.find((driver) => driver.driverNumber === driverNumber)?.code ?? "—"
    );
  };

  const { data } = summary;

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Trophy className="h-4 w-4 text-amber-400" />
          {dictionary.summary.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {dictionary.summary.winner}
            </span>
            <span className="text-2xl font-bold">
              {codeOf(data.winnerDriverNumber)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {dictionary.summary.podium}
            </span>
            <div className="flex gap-1.5">
              {data.podiumDriverNumbers.map((driverNumber, index) => (
                <Badge
                  key={driverNumber}
                  variant={index === 0 ? "high" : "outline"}
                >
                  P{index + 1} {codeOf(driverNumber)}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <p className="text-sm leading-relaxed">{summary.narrative}</p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label={dictionary.summary.fastestLap}
            value={codeOf(data.fastestLapDriverNumber)}
          />
          <Stat
            label={dictionary.summary.overtakes}
            value={String(data.totalOvertakes)}
          />
          <Stat
            label={dictionary.summary.pitStops}
            value={String(data.totalPitStops)}
          />
          <Stat
            label={dictionary.summary.retirements}
            value={String(data.retiredDriverNumbers.length)}
          />
        </div>
      </CardContent>
    </Card>
  );
};
