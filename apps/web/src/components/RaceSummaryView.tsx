import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dictionary } from "@/i18n/Messages";
import { RaceSummaryData } from "@f1/domain";
import { Trophy } from "lucide-react";

// 코드 조회에 필요한 최소 형태. LiveDriverState 도 그대로 들어맞고, 스냅샷이 없는
// 아카이브 상세는 최종 순위 행에서 만들어 넘긴다.
export type SummaryDriverRef = {
  driverNumber: number;
  code: string;
};

type Props = {
  dictionary: Dictionary;
  data: RaceSummaryData;
  // AI 서술. 아카이브 상세처럼 LLM 을 태우지 않는 화면은 null 을 넘긴다.
  narrative: string | null;
  drivers: readonly SummaryDriverRef[];
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
export const RaceSummaryView = ({
  dictionary,
  data,
  narrative,
  drivers,
}: Props) => {
  const codeOf = (driverNumber: number | null): string => {
    if (driverNumber === null) {
      return "—";
    }

    return (
      drivers.find((driver) => driver.driverNumber === driverNumber)?.code ?? "—"
    );
  };

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

        {narrative === null ? null : (
          <p className="text-sm leading-relaxed">{narrative}</p>
        )}

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
