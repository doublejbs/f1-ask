"use client";

import { BottomSheetView } from "@/components/BottomSheetView";
import { DriverAvatarView } from "@/components/DriverAvatarView";
import { SectorChipsView } from "@/components/SectorChipsView";
import { TireCompoundView } from "@/components/TireCompoundView";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import {
  formatGap,
  formatLapTime,
  formatPositionChange,
  formatSpeed,
  getPositionChangeColor,
  teamColorHex,
} from "@/lib/Format";
import {
  MAX_TEAM_RADIO_CLIPS_IN_SHEET,
  formatRadioClock,
} from "@/lib/TeamRadio";
import { LiveDriverState, TeamRadioClip } from "@f1/domain";
import {
  ChevronUp,
  Disc3,
  Flag,
  Gauge,
  ListFilter,
  Pause,
  Play,
  Radio,
  Split,
  Timer,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  dictionary: Dictionary;
  // 시트를 여는 대상 드라이버. null 이면 닫힘.
  driver: LiveDriverState | null;
  // 필드 전체 섹터 최속(퍼플 판정용).
  fieldBestSectors: (number | null)[];
  // 이 드라이버의 팀 라디오 클립(최신순). 비어 있으면 섹션을 렌더링하지 않는다.
  radioClips: TeamRadioClip[];
  playingRadioUrl: string | null;
  onToggleRadio: (url: string) => void;
  onClose: () => void;
  // "AI에게 질문" — 시트를 닫고 AI 탭으로 전환하며 질문을 제출한다.
  onAskAi: (driver: LiveDriverState) => void;
  // "이 드라이버 이벤트만 보기" — 시트를 닫고 이벤트 피드를 이 드라이버로 좁힌다.
  onFilterEvents: (driver: LiveDriverState) => void;
};

type ContentProps = {
  dictionary: Dictionary;
  driver: LiveDriverState;
  fieldBestSectors: (number | null)[];
  radioClips: TeamRadioClip[];
  playingRadioUrl: string | null;
  onToggleRadio: (url: string) => void;
  onAskAi: (driver: LiveDriverState) => void;
  onFilterEvents: (driver: LiveDriverState) => void;
};

type RadioSectionProps = {
  dictionary: Dictionary;
  driverCode: string;
  clips: TeamRadioClip[];
  playingRadioUrl: string | null;
  onToggleRadio: (url: string) => void;
};

type StatRowProps = {
  icon: LucideIcon;
  label: string;
  // 목록 마지막 행에는 헤어라인을 붙이지 않는다.
  divided?: boolean;
  children: ReactNode;
};

// 아이콘 + 작은 라벨 + 큰 값의 스탯 행. 행 사이는 헤어라인으로만 나눈다.
const StatRow = ({
  icon: Icon,
  label,
  divided = true,
  children,
}: StatRowProps) => (
  <div
    className={cn(
      "flex min-h-[52px] items-center gap-3 py-2.5",
      divided && "hairline",
    )}
  >
    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />

    <span className="text-xs text-muted-foreground">{label}</span>

    <div className="flex-1" />

    <div className="flex shrink-0 items-center gap-2">{children}</div>
  </div>
);

// 팀 라디오 섹션. 기존 스탯 행과 같은 헤어라인 스타일로 최신 클립부터 나열한다.
const DriverRadioSection = ({
  dictionary,
  driverCode,
  clips,
  playingRadioUrl,
  onToggleRadio,
}: RadioSectionProps) => {
  const visible = clips.slice(0, MAX_TEAM_RADIO_CLIPS_IN_SHEET);

  return (
    <div className="mt-5 flex flex-col">
      <div className="flex items-center gap-2 pb-1">
        <Radio className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-xs text-muted-foreground">
          {dictionary.teamRadio.title}
        </span>
      </div>

      {visible.map((clip, index) => {
        const playing = playingRadioUrl === clip.recordingUrl;

        const handleToggle = () => {
          onToggleRadio(clip.recordingUrl);
        };

        return (
          <div
            key={`${clip.driverNumber}-${clip.timestamp}`}
            className={cn(
              "flex min-h-[52px] items-center gap-3 py-2.5",
              index < visible.length - 1 && "hairline",
            )}
          >
            <button
              type="button"
              onClick={handleToggle}
              aria-label={(playing
                ? dictionary.teamRadio.pause
                : dictionary.teamRadio.play
              ).replace("{code}", driverCode)}
              className={cn(
                "press flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors",
                playing
                  ? "border-primary text-primary"
                  : "border-white/10 text-foreground hover:bg-white/5",
              )}
            >
              {playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 translate-x-[1px]" />
              )}
            </button>

            <div className="flex-1" />

            <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
              {formatRadioClock(clip.timestamp)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// 시트 본문. 드라이버가 확정된 경우에만 렌더링해 null 접근을 피한다.
const DriverDetailContent = ({
  dictionary,
  driver,
  fieldBestSectors,
  radioClips,
  playingRadioUrl,
  onToggleRadio,
  onAskAi,
  onFilterEvents,
}: ContentProps) => {
  const accent = teamColorHex(driver.teamColour) ?? "hsl(var(--border))";

  const handleAskAi = () => {
    onAskAi(driver);
  };

  const handleFilterEvents = () => {
    onFilterEvents(driver);
  };

  return (
    <>
      <div className="mb-5 flex items-center gap-4 pr-11">
        <DriverAvatarView
          code={driver.code}
          headshotUrl={driver.headshotUrl}
          teamColour={driver.teamColour}
          className="h-20 w-20 text-lg"
        />

        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              id="driver-sheet-title"
              className="text-3xl font-bold tracking-tight"
            >
              {driver.code}
            </span>
            <span className="text-sm text-muted-foreground">
              #{driver.driverNumber}
            </span>
            {driver.retired ? (
              <Badge variant="stale">{dictionary.table.retired}</Badge>
            ) : driver.inPit ? (
              <Badge variant="delayed">{dictionary.table.inPit}</Badge>
            ) : null}
          </div>

          <span
            className="truncate text-sm font-semibold"
            style={{ color: accent }}
          >
            {/* 상세 시트는 폭이 충분하고 상세 화면이므로 원본 전체 팀명을 유지한다.
                짧은 표기(getTeamShortName)는 순위 행처럼 좁은 자리에서만 쓴다. */}
            {driver.teamName}
          </span>

          <span className="flex items-center gap-2 text-sm">
            <span className="font-bold tabular-nums">
              {driver.position === null
                ? "—"
                : `P${String(driver.position).padStart(2, "0")}`}
            </span>
            <span
              className={cn(
                "text-xs font-semibold tabular-nums",
                getPositionChangeColor(driver.positionChange),
              )}
            >
              {formatPositionChange(driver.positionChange)}
            </span>
          </span>
        </div>
      </div>

      <div className="flex flex-col">
        <StatRow icon={Flag} label={dictionary.driverSheet.leadGap}>
          <span className="text-2xl font-bold tabular-nums">
            {driver.position === 1
              ? dictionary.table.leader
              : formatGap(driver.gapToLeaderSeconds)}
          </span>
        </StatRow>

        <StatRow icon={ChevronUp} label={dictionary.driverSheet.ahead}>
          <span className="text-2xl font-bold tabular-nums">
            {formatGap(driver.intervalToAheadSeconds)}
          </span>
        </StatRow>

        <StatRow icon={Disc3} label={dictionary.table.tire}>
          <TireCompoundView
            dictionary={dictionary}
            compound={driver.compound}
            tireAgeLaps={driver.tireAgeLaps}
          />
        </StatRow>

        <StatRow icon={Timer} label={dictionary.driverSheet.lastLap}>
          <span className="text-2xl font-bold tabular-nums">
            {formatLapTime(driver.lastLapSeconds)}
          </span>
        </StatRow>

        <StatRow icon={Gauge} label={dictionary.driverSheet.topSpeed}>
          <span className="text-2xl font-bold tabular-nums">
            {formatSpeed(driver.topSpeedKph)}
          </span>
        </StatRow>

        <StatRow icon={Wrench} label={dictionary.driverSheet.pitStops}>
          <span className="text-2xl font-bold tabular-nums">
            {String(driver.pitStopCount)}
          </span>
        </StatRow>

        <StatRow
          icon={Split}
          label={dictionary.driverSheet.sectors}
          divided={false}
        >
          <SectorChipsView
            sectors={driver.lastSectorsSeconds}
            fieldBest={fieldBestSectors}
          />
        </StatRow>
      </div>

      {radioClips.length > 0 ? (
        <DriverRadioSection
          dictionary={dictionary}
          driverCode={driver.code}
          clips={radioClips}
          playingRadioUrl={playingRadioUrl}
          onToggleRadio={onToggleRadio}
        />
      ) : null}

      <Button type="button" onClick={handleAskAi} className="mt-5 w-full">
        {dictionary.driverSheet.ask.replace("{code}", driver.code)}
      </Button>

      {/* 보조 액션: 이벤트 피드를 이 드라이버로 좁힌다 (docs/13-race-console.md 원칙 3). */}
      <Button
        type="button"
        variant="outline"
        onClick={handleFilterEvents}
        className="mt-2 w-full"
      >
        <ListFilter className="h-4 w-4" aria-hidden />
        {dictionary.driverSheet.filterEvents.replace("{code}", driver.code)}
      </Button>
    </>
  );
};

// 순위 행 탭 → 드라이버 상세 바텀 시트. 오버레이·닫기·스크롤 잠금·포커스는
// 공유 BottomSheetView 가 담당하고, 본문만 여기서 조립한다.
export const DriverDetailSheetView = ({
  dictionary,
  driver,
  fieldBestSectors,
  radioClips,
  playingRadioUrl,
  onToggleRadio,
  onClose,
  onAskAi,
  onFilterEvents,
}: Props) => (
  <BottomSheetView
    isOpen={driver !== null}
    onClose={onClose}
    titleId="driver-sheet-title"
    closeLabel={dictionary.driverSheet.close}
  >
    {driver !== null ? (
      <DriverDetailContent
        dictionary={dictionary}
        driver={driver}
        fieldBestSectors={fieldBestSectors}
        radioClips={radioClips}
        playingRadioUrl={playingRadioUrl}
        onToggleRadio={onToggleRadio}
        onAskAi={onAskAi}
        onFilterEvents={onFilterEvents}
      />
    ) : null}
  </BottomSheetView>
);
