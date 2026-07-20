"use client";

import { SectionView } from "@/components/ui/SectionView";
import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import {
  formatGapCompact,
  formatPositionChange,
  getPositionChangeColor,
  teamColorHex,
} from "@/lib/Format";
import { isRecentTeamRadio } from "@/lib/TeamRadio";
import { getTeamShortName } from "@/lib/TeamShortName";
import { LiveDriverState, TeamRadioClip, TireCompound } from "@f1/domain";
import { ChevronRight, Pause, Radio, Star } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  drivers: LiveDriverState[];
  // 드라이버 번호 → 팀 라디오 클립(최신순). 클립이 있는 드라이버만 담긴다.
  radiosByDriver: Map<number, TeamRadioClip[]>;
  // 최근 무전 판정 기준 시각(경기 시계). 리플레이에서도 올바르게 동작한다.
  radioReferenceMs: number;
  playingRadioUrl: string | null;
  isFavorite: (driverNumber: number) => boolean;
  onToggleFavorite: (driverNumber: number) => void;
  onToggleRadio: (url: string) => void;
  onSelectDriver: (driver: LiveDriverState) => void;
};

type RowProps = {
  dictionary: Dictionary;
  driver: LiveDriverState;
  favorite: boolean;
  // 이 드라이버의 최신 클립. 없으면 null.
  latestRadio: TeamRadioClip | null;
  radioReferenceMs: number;
  playingRadioUrl: string | null;
  // 목록 마지막 행에는 헤어라인을 붙이지 않는다.
  divided: boolean;
  onToggleFavorite: (driverNumber: number) => void;
  onToggleRadio: (url: string) => void;
  onSelectDriver: (driver: LiveDriverState) => void;
};

// 순위 번호를 0 패딩 2자리로. 미정이면 "—".
const formatPosition = (position: number | null): string => {
  if (position === null) {
    return "—";
  }

  return String(position).padStart(2, "0");
};

// 컴팩트 행용 타이어 라벨 색. Tailwind 퍼지 때문에 리터럴 클래스만 사용한다.
const getCompoundTextColor = (compound: TireCompound): string => {
  switch (compound) {
    case TireCompound.Soft:
      return "text-red-300";
    case TireCompound.Medium:
      return "text-amber-200";
    case TireCompound.Hard:
      return "text-slate-100";
    case TireCompound.Intermediate:
      return "text-emerald-300";
    case TireCompound.Wet:
      return "text-sky-300";
    default:
      return "text-slate-400";
  }
};

// 타이어 요약 문자열: "S·3L". 컴파운드 미상이면 "?".
const formatTireSummary = (
  dictionary: Dictionary,
  compound: TireCompound,
  tireAgeLaps: number | null,
): string => {
  const letter =
    compound === TireCompound.Unknown ? "?" : compound.charAt(0).toUpperCase();
  const age =
    tireAgeLaps === null ? "—" : `${tireAgeLaps}${dictionary.table.lapsUnit}`;

  return `${letter}·${age}`;
};

// 레퍼런스 순위 행.
//   01  ▌ANT              선두  ›
//         Mercedes  S·3L
const DriverRow = ({
  dictionary,
  driver,
  favorite,
  latestRadio,
  radioReferenceMs,
  playingRadioUrl,
  divided,
  onToggleFavorite,
  onToggleRadio,
  onSelectDriver,
}: RowProps) => {
  const accent = teamColorHex(driver.teamColour);
  const leading = driver.position === 1;
  const radioPlaying =
    latestRadio !== null && playingRadioUrl === latestRadio.recordingUrl;
  const radioRecent =
    latestRadio !== null &&
    isRecentTeamRadio(latestRadio.timestamp, radioReferenceMs);

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

  // 시트를 열지 않고 최신 클립을 바로 재생한다. 행 탭과 충돌하지 않게 전파를 막는다.
  const handleToggleRadio = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (latestRadio === null) {
      return;
    }

    onToggleRadio(latestRadio.recordingUrl);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        "press flex min-h-[56px] cursor-pointer items-center gap-2.5 px-1 py-2 outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
        divided && "hairline",
        driver.retired && "opacity-45",
      )}
    >
      <button
        type="button"
        onClick={handleToggleFavorite}
        aria-label={dictionary.table.favorite}
        aria-pressed={favorite}
        className="press -my-1 -ml-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-amber-400"
      >
        <Star
          className={cn("h-4 w-4", favorite && "fill-amber-400 text-amber-400")}
        />
      </button>

      <span className="w-6 shrink-0 text-right text-base font-semibold tabular-nums text-muted-foreground">
        {formatPosition(driver.position)}
      </span>

      <span
        className="h-9 w-[3px] shrink-0 rounded-full"
        style={{ backgroundColor: accent ?? "hsl(var(--border))" }}
        aria-hidden
      />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* 코드 줄에는 여백이 남는다. 라디오 버튼을 여기 두어 팀명 폭을 잠식하지 않는다. */}
        <span className="flex min-w-0 items-center gap-1 text-lg font-bold leading-tight tracking-tight">
          {driver.code}

          {latestRadio !== null ? (
            <button
              type="button"
              onClick={handleToggleRadio}
              aria-label={(radioPlaying
                ? dictionary.teamRadio.pause
                : dictionary.teamRadio.play
              ).replace("{code}", driver.code)}
              title={radioRecent ? dictionary.teamRadio.recent : undefined}
              className={cn(
                "press -my-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/5",
                radioPlaying
                  ? "text-primary"
                  : radioRecent
                    ? "animate-pulse text-primary"
                    : "text-muted-foreground/70",
              )}
            >
              {radioPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Radio className="h-4 w-4" />
              )}
            </button>
          ) : null}
        </span>

        <span className="flex min-w-0 items-center gap-1.5 text-xs leading-tight">
          <span
            className="truncate font-semibold"
            style={{ color: accent ?? undefined }}
          >
            {/* 순위 행은 폭이 좁고 라디오 인디케이터가 동적으로 붙어서
                원본 팀명이 잘린다. 여기서는 짧은 표기를 쓴다.
                (상세 시트는 공간이 충분해 원본 전체 이름을 유지한다) */}
            {getTeamShortName(driver.teamName)}
          </span>

          <span className="text-muted-foreground/40" aria-hidden>
            ·
          </span>

          <span
            title={dictionary.compound[driver.compound]}
            className={cn(
              "shrink-0 font-semibold tabular-nums",
              getCompoundTextColor(driver.compound),
            )}
          >
            {formatTireSummary(
              dictionary,
              driver.compound,
              driver.tireAgeLaps,
            )}
          </span>
        </span>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span
          className={cn(
            "font-bold leading-tight tabular-nums",
            leading ? "text-sm text-muted-foreground" : "text-lg",
          )}
        >
          {leading
            ? dictionary.table.leader
            : formatGapCompact(driver.gapToLeaderSeconds)}
        </span>

        <span
          className={cn(
            "text-xs font-semibold leading-tight tabular-nums",
            getPositionChangeColor(driver.positionChange),
          )}
        >
          {formatPositionChange(driver.positionChange)}
        </span>
      </div>

      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground/50"
        aria-hidden
      />
    </div>
  );
};

// 모바일용 순위 목록. 카드 없이 헤어라인 행으로 나열한다.
// 관심 드라이버는 최상단 고정 섹션으로 분리하고, 전체 필드는 그 아래 순위 순으로 나열한다.
// 행 탭 → 상세 바텀 시트.
export const DriverListView = ({
  dictionary,
  drivers,
  radiosByDriver,
  radioReferenceMs,
  playingRadioUrl,
  isFavorite,
  onToggleFavorite,
  onToggleRadio,
  onSelectDriver,
}: Props) => {
  const favorites = drivers.filter((driver) => isFavorite(driver.driverNumber));
  const findLatestRadio = (driverNumber: number): TeamRadioClip | null =>
    radiosByDriver.get(driverNumber)?.[0] ?? null;

  return (
    <div className="flex flex-col gap-5">
      {favorites.length > 0 ? (
        <SectionView title={dictionary.driverSheet.favorites}>
          <div className="flex flex-col">
            {favorites.map((driver, index) => (
              <DriverRow
                key={`fav-${driver.driverNumber}`}
                dictionary={dictionary}
                driver={driver}
                favorite
                latestRadio={findLatestRadio(driver.driverNumber)}
                radioReferenceMs={radioReferenceMs}
                playingRadioUrl={playingRadioUrl}
                divided={index < favorites.length - 1}
                onToggleFavorite={onToggleFavorite}
                onToggleRadio={onToggleRadio}
                onSelectDriver={onSelectDriver}
              />
            ))}
          </div>
        </SectionView>
      ) : null}

      <SectionView title={dictionary.table.title}>
        <div className="flex flex-col">
          {drivers.map((driver, index) => (
            <DriverRow
              key={driver.driverNumber}
              dictionary={dictionary}
              driver={driver}
              favorite={isFavorite(driver.driverNumber)}
              latestRadio={findLatestRadio(driver.driverNumber)}
              radioReferenceMs={radioReferenceMs}
              playingRadioUrl={playingRadioUrl}
              divided={index < drivers.length - 1}
              onToggleFavorite={onToggleFavorite}
              onToggleRadio={onToggleRadio}
              onSelectDriver={onSelectDriver}
            />
          ))}
        </div>
      </SectionView>
    </div>
  );
};
