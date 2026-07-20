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
import { LiveDriverState } from "@f1/domain";
import {
  ChevronUp,
  Disc3,
  Flag,
  Gauge,
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
  onClose: () => void;
  // "AI에게 질문" — 시트를 닫고 AI 탭으로 전환하며 질문을 제출한다.
  onAskAi: (driver: LiveDriverState) => void;
};

type ContentProps = {
  dictionary: Dictionary;
  driver: LiveDriverState;
  fieldBestSectors: (number | null)[];
  onAskAi: (driver: LiveDriverState) => void;
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

// 시트 본문. 드라이버가 확정된 경우에만 렌더링해 null 접근을 피한다.
const DriverDetailContent = ({
  dictionary,
  driver,
  fieldBestSectors,
  onAskAi,
}: ContentProps) => {
  const accent = teamColorHex(driver.teamColour) ?? "hsl(var(--border))";

  const handleAskAi = () => {
    onAskAi(driver);
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

      <Button type="button" onClick={handleAskAi} className="mt-5 w-full">
        {dictionary.driverSheet.ask.replace("{code}", driver.code)}
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
  onClose,
  onAskAi,
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
        onAskAi={onAskAi}
      />
    ) : null}
  </BottomSheetView>
);
