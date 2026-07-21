"use client";

import { Badge } from "@/components/ui/Badge";
import { Dictionary } from "@/i18n/Messages";
import {
  formatArchiveGap,
  formatRaceDuration,
  teamColorHex,
} from "@/lib/Format";
import { getTeamShortName } from "@/lib/TeamShortName";
import { cn } from "@/lib/Utils";
import { ArchiveResultRow, ArchiveResultStatus } from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  results: ArchiveResultRow[];
};

// 열 폭은 내용 최댓값에서 역산한 고정값이다. 팀명은 좁은 자리라 짧은 표기를 쓰고
// 잘라내지 않는다 — 식별 열이 남는 폭을 모두 가져가므로 넘칠 여지가 없다.
const GAP_COLUMN_CLASS = "w-[5.5rem]";
const LAPS_COLUMN_CLASS = "w-[2.75rem]";
const POINTS_COLUMN_CLASS = "w-[2.75rem]";

const STATUS_BADGE_VARIANT: Record<
  ArchiveResultStatus,
  "default" | "critical" | "high" | "outline"
> = {
  [ArchiveResultStatus.Finished]: "outline",
  [ArchiveResultStatus.Dnf]: "high",
  [ArchiveResultStatus.Dns]: "outline",
  [ArchiveResultStatus.Dsq]: "critical",
};

// 최종 순위. 포지션·드라이버·팀·갭·랩·포인트 + DNF/DSQ 배지.
export const ArchiveResultsView = ({ dictionary, results }: Props) => (
  <section className="flex flex-col gap-2">
    <h3 className="text-[13px] font-bold uppercase tracking-[0.1em] text-foreground/80">
      {dictionary.archive.results}
    </h3>

    <div className="flex items-center gap-3 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
      <span className="w-9 shrink-0">{dictionary.archive.columns.position}</span>
      <span className="min-w-0 flex-1">
        {dictionary.archive.columns.driver}
      </span>
      <span className={cn(GAP_COLUMN_CLASS, "shrink-0 text-right")}>
        {dictionary.archive.columns.gap}
      </span>
      <span className={cn(LAPS_COLUMN_CLASS, "shrink-0 text-right")}>
        {dictionary.archive.columns.laps}
      </span>
      <span className={cn(POINTS_COLUMN_CLASS, "shrink-0 text-right")}>
        {dictionary.archive.columns.points}
      </span>
    </div>

    <ul className="flex flex-col">
      {results.map((row, index) => {
        const isLeader = row.position === 1;
        const isFinished = row.status === ArchiveResultStatus.Finished;

        return (
          <li
            key={row.driverNumber}
            className={cn(
              "flex min-h-[3rem] items-center gap-3 py-2",
              index < results.length - 1 && "hairline",
            )}
          >
            <span className="w-9 shrink-0 text-lg font-semibold tabular-nums text-muted-foreground">
              {row.position === null
                ? "—"
                : String(row.position).padStart(2, "0")}
            </span>

            <span
              aria-hidden
              className="h-8 w-[3px] shrink-0 rounded-full"
              style={{
                backgroundColor:
                  teamColorHex(row.teamColour) ?? "hsl(var(--muted-foreground))",
              }}
            />

            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1.5">
                <span className="text-base font-bold">{row.driverCode}</span>

                {isFinished ? null : (
                  <Badge variant={STATUS_BADGE_VARIANT[row.status]}>
                    {dictionary.archive.status[row.status]}
                  </Badge>
                )}
              </span>

              <span
                className="text-xs"
                style={{
                  color:
                    teamColorHex(row.teamColour) ??
                    "hsl(var(--muted-foreground))",
                }}
                title={row.teamName}
              >
                {getTeamShortName(row.teamName)}
              </span>
            </span>

            <span
              className={cn(
                GAP_COLUMN_CLASS,
                "shrink-0 text-right text-sm tabular-nums",
              )}
            >
              {isLeader
                ? formatRaceDuration(row.totalTimeSeconds)
                : formatArchiveGap(row.gapToLeaderSeconds, row.gapLabel, false)}
            </span>

            <span
              className={cn(
                LAPS_COLUMN_CLASS,
                "shrink-0 text-right text-sm tabular-nums text-muted-foreground",
              )}
            >
              {row.lapsCompleted ?? "—"}
            </span>

            <span
              className={cn(
                POINTS_COLUMN_CLASS,
                "shrink-0 text-right text-sm font-semibold tabular-nums",
              )}
            >
              {row.points === null || row.points === 0 ? "—" : row.points}
            </span>
          </li>
        );
      })}
    </ul>
  </section>
);
