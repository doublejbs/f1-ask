import { TireCompoundView } from "@/components/TireCompoundView";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Dictionary } from "@/i18n/Messages";
import { translateRaceEvent } from "@/i18n/TranslateRaceEvent";
import { formatGap, formatLapTime, formatPositionChange } from "@/lib/Format";
import { cn } from "@/lib/Utils";
import { FavoriteDriverDetail, SupportedLocale } from "@f1/domain";
import { Star } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  detail: FavoriteDriverDetail;
  onRemove: (driverNumber: number) => void;
};

type StatProps = {
  label: string;
  value: string;
  className?: string;
};

const Stat = ({ label, value, className }: StatProps) => (
  <div className="flex flex-col">
    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
    <span className={cn("text-sm font-semibold tabular-nums", className)}>
      {value}
    </span>
  </div>
);

// 관심 드라이버 상세 카드 (docs/01-project-overview.md §7.2).
export const FavoriteDriverCardView = ({
  dictionary,
  locale,
  detail,
  onRemove,
}: Props) => (
  <Card className={cn(detail.retired && "opacity-60")}>
    <CardContent className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-base font-bold tabular-nums">
            {detail.currentPosition ?? "—"}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold">{detail.code}</span>
              <span className="text-xs text-muted-foreground">
                #{detail.driverNumber}
              </span>
              {detail.retired ? (
                <Badge variant="stale">{dictionary.table.retired}</Badge>
              ) : detail.inPit ? (
                <Badge variant="delayed">{dictionary.table.inPit}</Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{detail.teamName}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onRemove(detail.driverNumber)}
          aria-label={dictionary.table.favorite}
          aria-pressed
          className="text-amber-400 transition-colors hover:text-amber-300"
        >
          <Star className="h-4 w-4 fill-amber-400" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat
          label={dictionary.favoriteCard.start}
          value={
            detail.startingPosition === null
              ? "—"
              : `P${detail.startingPosition} ${formatPositionChange(detail.positionChange)}`
          }
        />
        <Stat
          label={dictionary.favoriteCard.ahead}
          value={formatGap(detail.gapAheadSeconds)}
        />
        <Stat
          label={dictionary.favoriteCard.behind}
          value={formatGap(detail.gapBehindSeconds)}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {dictionary.table.tire}
          </span>
          <TireCompoundView
            dictionary={dictionary}
            compound={detail.compound}
            tireAgeLaps={detail.tireAgeLaps}
          />
        </div>
        <Stat
          label={dictionary.favoriteCard.pitStops}
          value={String(detail.pitStopCount)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {dictionary.favoriteCard.recentPace}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {detail.recentLapTimesSeconds.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            detail.recentLapTimesSeconds.map((seconds, index) => (
              <span
                key={`${detail.driverNumber}-lap-${index}`}
                className="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground"
              >
                {formatLapTime(seconds)}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {dictionary.favoriteCard.recentEvents}
        </span>
        {detail.recentEvents.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            {dictionary.favoriteCard.noEvents}
          </span>
        ) : (
          <ul className="flex flex-col gap-1">
            {detail.recentEvents.map((event) => (
              <li key={event.id} className="text-xs leading-snug">
                {translateRaceEvent(event, locale)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </CardContent>
  </Card>
);
