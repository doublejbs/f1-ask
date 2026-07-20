"use client";

import { TireCompoundView } from "@/components/TireCompoundView";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import {
  formatGap,
  formatPositionChange,
  getPositionChangeColor,
  teamColorHex,
} from "@/lib/Format";
import { LiveDriverState } from "@f1/domain";
import { Star } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  drivers: LiveDriverState[];
  isFavorite: (driverNumber: number) => boolean;
  onToggleFavorite: (driverNumber: number) => void;
  onSelectDriver: (driver: LiveDriverState) => void;
};

type RowProps = {
  dictionary: Dictionary;
  driver: LiveDriverState;
  favorite: boolean;
  onToggleFavorite: (driverNumber: number) => void;
  onSelectDriver: (driver: LiveDriverState) => void;
};

// 컴팩트 순위 행: [★][팀컬러바] P2 LEC ▲2  [타이어] +1.9. 가로 스크롤 없음, 44px 이상.
const DriverRow = ({
  dictionary,
  driver,
  favorite,
  onToggleFavorite,
  onSelectDriver,
}: RowProps) => {
  const accent = teamColorHex(driver.teamColour);

  const handleSelect = () => {
    onSelectDriver(driver);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectDriver(driver);
    }
  };

  const handleToggleFavorite = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggleFavorite(driver.driverNumber);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        "press flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-white/[0.04]",
        driver.retired && "opacity-45",
      )}
    >
      <button
        type="button"
        onClick={handleToggleFavorite}
        aria-label={dictionary.table.favorite}
        aria-pressed={favorite}
        className="press -my-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-amber-400"
      >
        <Star
          className={cn(
            "h-4 w-4",
            favorite && "fill-amber-400 text-amber-400",
          )}
        />
      </button>

      <span
        className="h-7 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: accent ?? "hsl(var(--border))" }}
        aria-hidden
      />

      <span className="w-8 shrink-0 text-center text-base font-bold tabular-nums">
        {driver.position === null ? "—" : `P${driver.position}`}
      </span>

      <span className="w-10 shrink-0 font-bold">{driver.code}</span>

      <span
        className={cn(
          "w-8 shrink-0 text-xs font-semibold tabular-nums",
          getPositionChangeColor(driver.positionChange),
        )}
      >
        {formatPositionChange(driver.positionChange)}
      </span>

      <div className="flex-1" />

      <TireCompoundView
        dictionary={dictionary}
        compound={driver.compound}
        tireAgeLaps={driver.tireAgeLaps}
      />

      <span className="w-16 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
        {driver.position === 1
          ? dictionary.table.leader
          : formatGap(driver.gapToLeaderSeconds)}
      </span>
    </div>
  );
};

// 모바일용 컴팩트 순위 목록. 관심 드라이버는 최상단 고정 섹션으로 분리하고,
// 전체 필드는 그 아래 순위 순으로 나열한다. 행 탭 → 상세 바텀 시트.
export const DriverListView = ({
  dictionary,
  drivers,
  isFavorite,
  onToggleFavorite,
  onSelectDriver,
}: Props) => {
  const favorites = drivers.filter((driver) => isFavorite(driver.driverNumber));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.table.title}</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-0.5 p-2">
        {favorites.length > 0 ? (
          <>
            <div className="px-1.5 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {dictionary.driverSheet.favorites}
            </div>

            {favorites.map((driver) => (
              <DriverRow
                key={`fav-${driver.driverNumber}`}
                dictionary={dictionary}
                driver={driver}
                favorite
                onToggleFavorite={onToggleFavorite}
                onSelectDriver={onSelectDriver}
              />
            ))}

            <div className="my-1 border-t border-white/8" />
          </>
        ) : null}

        {drivers.map((driver) => (
          <DriverRow
            key={driver.driverNumber}
            dictionary={dictionary}
            driver={driver}
            favorite={isFavorite(driver.driverNumber)}
            onToggleFavorite={onToggleFavorite}
            onSelectDriver={onSelectDriver}
          />
        ))}
      </CardContent>
    </Card>
  );
};
