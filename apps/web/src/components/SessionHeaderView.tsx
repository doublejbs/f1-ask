import { ConnectionStatusView } from "@/components/ConnectionStatusView";
import { ExplanationLevelSwitcherView } from "@/components/ExplanationLevelSwitcherView";
import { LocaleSwitcherView } from "@/components/LocaleSwitcherView";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import {
  DataFreshnessStatus,
  DataMode,
  ExplanationLevel,
  LiveRaceSnapshot,
  SessionStatus,
  SupportedLocale,
} from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  snapshot: LiveRaceSnapshot;
  dataMode: DataMode;
  freshness: DataFreshnessStatus;
  explanationLevel: ExplanationLevel;
  onChangeExplanationLevel: (level: ExplanationLevel) => void;
};

const statusVariant = (
  status: SessionStatus,
): "live" | "delayed" | "critical" | "outline" => {
  switch (status) {
    case SessionStatus.Green:
      return "live";
    case SessionStatus.Yellow:
      return "delayed";
    case SessionStatus.SafetyCar:
    case SessionStatus.VirtualSafetyCar:
    case SessionStatus.Red:
      return "critical";
    default:
      return "outline";
  }
};

const statusDotColor = (status: SessionStatus): string => {
  switch (status) {
    case SessionStatus.Green:
      return "bg-emerald-400";
    case SessionStatus.Yellow:
      return "bg-amber-400";
    case SessionStatus.SafetyCar:
    case SessionStatus.VirtualSafetyCar:
    case SessionStatus.Red:
      return "bg-red-400";
    case SessionStatus.Finished:
      return "bg-slate-400";
    default:
      return "bg-slate-500";
  }
};

// 세션 히어로: 세션명 / 대형 랩 게이지 + 진행 바 / 상태·연결·설명수준.
export const SessionHeaderView = ({
  dictionary,
  locale,
  snapshot,
  dataMode,
  freshness,
  explanationLevel,
  onChangeExplanationLevel,
}: Props) => {
  const isLive = snapshot.status === SessionStatus.Green;
  const progress =
    snapshot.currentLap !== null &&
    snapshot.totalLaps !== null &&
    snapshot.totalLaps > 0
      ? Math.min(100, (snapshot.currentLap / snapshot.totalLaps) * 100)
      : null;

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/90">
              {dictionary.appName}
            </p>
            <h1 className="mt-1 truncate text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              {snapshot.sessionName}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {snapshot.circuitName} · {snapshot.countryCode}
            </p>
          </div>
          <LocaleSwitcherView dictionary={dictionary} currentLocale={locale} />
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="flex items-baseline gap-2">
            <div className="flex flex-col leading-none">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {dictionary.header.lap}
              </span>
              <span className="mt-1 text-5xl font-bold tabular-nums tracking-tight sm:text-6xl">
                {snapshot.currentLap ?? "—"}
              </span>
            </div>
            {snapshot.totalLaps !== null ? (
              <span className="pb-1 text-lg font-medium text-muted-foreground">
                / {snapshot.totalLaps}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Badge variant={statusVariant(snapshot.status)}>
              <span className="relative flex h-1.5 w-1.5">
                {isLive ? (
                  <span
                    className={cn(
                      "absolute inline-flex h-full w-full animate-pulse-ring rounded-full",
                      statusDotColor(snapshot.status),
                    )}
                  />
                ) : null}
                <span
                  className={cn(
                    "relative inline-flex h-1.5 w-1.5 rounded-full",
                    statusDotColor(snapshot.status),
                  )}
                />
              </span>
              {dictionary.status[snapshot.status]}
            </Badge>

            <ConnectionStatusView
              dictionary={dictionary}
              dataMode={dataMode}
              freshness={freshness}
            />
          </div>

          <div className="ml-auto">
            <ExplanationLevelSwitcherView
              dictionary={dictionary}
              level={explanationLevel}
              onChangeLevel={onChangeExplanationLevel}
            />
          </div>
        </div>

        {progress !== null ? (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-[width] duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
