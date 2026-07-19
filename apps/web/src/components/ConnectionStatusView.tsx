import { Badge } from "@/components/ui/Badge";
import { Dictionary } from "@/i18n/Messages";
import { DataFreshnessStatus, DataMode } from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  dataMode: DataMode;
  freshness: DataFreshnessStatus;
};

const freshnessVariant = (
  freshness: DataFreshnessStatus,
): "live" | "delayed" | "stale" | "outline" => {
  switch (freshness) {
    case DataFreshnessStatus.Live:
      return "live";
    case DataFreshnessStatus.Delayed:
      return "delayed";
    case DataFreshnessStatus.Stale:
      return "stale";
    default:
      return "outline";
  }
};

// 데이터 연결 상태 표시: 데이터 모드 + 신선도.
export const ConnectionStatusView = ({
  dictionary,
  dataMode,
  freshness,
}: Props) => (
  <div className="flex items-center gap-2">
    <Badge variant="outline">{dictionary.mode[dataMode]}</Badge>
    <Badge variant={freshnessVariant(freshness)}>
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {dictionary.freshness[freshness]}
    </Badge>
  </div>
);
