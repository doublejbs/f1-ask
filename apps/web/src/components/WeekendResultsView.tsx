"use client";

import { useWeekendResults } from "@/hooks/UseWeekendResults";
import { Dictionary } from "@/i18n/Messages";
import { formatGap, formatLapTime } from "@/lib/Format";
import {
  QualifyingResult,
  PracticeResult,
  WeekendSessionResults,
} from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  meetingKey: number;
};

const PracticeTable = ({
  dictionary,
  rows,
}: {
  dictionary: Dictionary;
  rows: PracticeResult[];
}) => {
  const texts = dictionary.weekendResults;

  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr className="text-muted-foreground">
          <th className="py-1.5 pr-2 text-left font-medium">{texts.position}</th>
          <th className="py-1.5 pr-2 text-left font-medium">{texts.driver}</th>
          <th className="py-1.5 pr-2 text-right font-medium">{texts.best}</th>
          <th className="py-1.5 text-right font-medium">{texts.gap}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.driverNumber} className="border-t border-white/[0.06]">
            <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">
              {row.position ?? "–"}
            </td>
            <td className="py-1.5 pr-2 font-bold tracking-tight text-foreground">
              {row.code}
            </td>
            <td className="py-1.5 pr-2 text-right tabular-nums">
              {formatLapTime(row.bestLapSeconds)}
            </td>
            <td className="py-1.5 text-right tabular-nums text-muted-foreground">
              {row.gapToLeaderSeconds === null ? "" : formatGap(row.gapToLeaderSeconds)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const QualifyingTable = ({
  dictionary,
  rows,
}: {
  dictionary: Dictionary;
  rows: QualifyingResult[];
}) => {
  const texts = dictionary.weekendResults;

  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr className="text-muted-foreground">
          <th className="py-1.5 pr-2 text-left font-medium">{texts.position}</th>
          <th className="py-1.5 pr-2 text-left font-medium">{texts.driver}</th>
          {["Q1", "Q2", "Q3"].map((label) => (
            <th key={label} className="py-1.5 pr-2 text-right font-medium">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.driverNumber} className="border-t border-white/[0.06]">
            <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">
              {row.finalPosition ?? "–"}
            </td>
            <td className="py-1.5 pr-2 font-bold tracking-tight text-foreground">
              {row.code}
            </td>
            {row.segments.map((segment) => (
              <td
                key={segment.index}
                className="py-1.5 pr-2 text-right tabular-nums"
              >
                {segment.lapSeconds === null ? (
                  <span className="text-muted-foreground/40">–</span>
                ) : (
                  <span className="inline-flex items-baseline gap-1">
                    {formatLapTime(segment.lapSeconds)}
                    {segment.rank !== null ? (
                      // 세그먼트 랭크(기록자끼리) — 최종 순위와 다르다(docs/27).
                      <span className="text-[10px] text-sky-300/80">
                        P{segment.rank}
                      </span>
                    ) : null}
                  </span>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// 「기록」 상세의 주말 결과 — 프랙티스 베스트랩 + 퀄리 Q1/Q2/Q3 (세그먼트 랭크) (docs/27, E1).
export const WeekendResultsView = ({ dictionary, meetingKey }: Props) => {
  const texts = dictionary.weekendResults;
  const { results, isLoading, hasError } = useWeekendResults(meetingKey);

  const body = (() => {
    if (isLoading) {
      return (
        <p className="animate-pulse py-6 text-sm text-muted-foreground">
          {texts.loading}
        </p>
      );
    }

    if (hasError) {
      return <p className="py-6 text-sm text-muted-foreground">{texts.error}</p>;
    }

    if (results === null || results.sessions.length === 0) {
      return <p className="py-6 text-sm text-muted-foreground">{texts.empty}</p>;
    }

    return (
      <div className="flex flex-col gap-4">
        {results.sessions.map((session: WeekendSessionResults) => (
          <div key={session.sessionKey} className="flex flex-col gap-1.5">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {session.name}
            </h4>
            <div className="overflow-x-auto">
              {session.type === "qualifying" ? (
                <QualifyingTable dictionary={dictionary} rows={session.qualifying} />
              ) : (
                <PracticeTable dictionary={dictionary} rows={session.practice} />
              )}
            </div>
          </div>
        ))}

        <p className="text-[11px] leading-relaxed text-muted-foreground/70">
          {texts.note}
        </p>
      </div>
    );
  })();

  return (
    <section
      aria-label={texts.title}
      className="glass-float flex flex-col gap-2 rounded-2xl p-3.5"
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[13px] font-semibold text-foreground">
          {texts.title}
        </h3>
        <p className="text-[11px] text-muted-foreground">{texts.subtitle}</p>
      </div>

      {body}
    </section>
  );
};
