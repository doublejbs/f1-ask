import { ConnectionStatusView } from "@/components/ConnectionStatusView";
import { ExplanationLevelSwitcherView } from "@/components/ExplanationLevelSwitcherView";
import { LocaleSwitcherView } from "@/components/LocaleSwitcherView";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Dictionary } from "@/i18n/Messages";
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

// 세션 이름 / 현재 랩·전체 랩 / 경기 상태 / 데이터 연결 상태 / locale 전환.
export const SessionHeaderView = ({
  dictionary,
  locale,
  snapshot,
  dataMode,
  freshness,
  explanationLevel,
  onChangeExplanationLevel,
}: Props) => (
  <Card>
    <CardContent className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {dictionary.appName}
          </p>
          <h1 className="text-lg font-bold leading-tight">
            {snapshot.sessionName}
          </h1>
          <p className="text-xs text-muted-foreground">
            {snapshot.circuitName} · {snapshot.countryCode}
          </p>
        </div>
        <LocaleSwitcherView dictionary={dictionary} currentLocale={locale} />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-baseline gap-1">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {dictionary.header.lap}
          </span>
          <span className="text-xl font-bold tabular-nums">
            {snapshot.currentLap ?? "—"}
          </span>
          {snapshot.totalLaps !== null ? (
            <span className="text-sm text-muted-foreground">
              {dictionary.header.lapSeparator} {snapshot.totalLaps}
            </span>
          ) : null}
        </div>

        <Badge variant={statusVariant(snapshot.status)}>
          {dictionary.status[snapshot.status]}
        </Badge>

        <ConnectionStatusView
          dictionary={dictionary}
          dataMode={dataMode}
          freshness={freshness}
        />

        <ExplanationLevelSwitcherView
          dictionary={dictionary}
          level={explanationLevel}
          onChangeLevel={onChangeExplanationLevel}
        />
      </div>
    </CardContent>
  </Card>
);
