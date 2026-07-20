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

type StatProps = {
  label: string;
  children: ReactNode;
};

const Stat = ({ label, children }: StatProps) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
    <span className="text-sm font-semibold tabular-nums">{children}</span>
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
      <div className="mb-4 flex items-center gap-3 pr-11">
        <DriverAvatarView
          code={driver.code}
          headshotUrl={driver.headshotUrl}
          teamColour={driver.teamColour}
          className="h-14 w-14 text-base"
        />
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span id="driver-sheet-title" className="text-xl font-bold">
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
          <span className="text-xs font-semibold" style={{ color: accent }}>
            {driver.teamName}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat label={dictionary.table.position}>
          <span className="flex items-center gap-1.5">
            {driver.position === null ? "—" : `P${driver.position}`}
            <span
              className={cn(
                "text-xs",
                getPositionChangeColor(driver.positionChange),
              )}
            >
              {formatPositionChange(driver.positionChange)}
            </span>
          </span>
        </Stat>
        <Stat label={dictionary.driverSheet.leadGap}>
          {driver.position === 1
            ? dictionary.table.leader
            : formatGap(driver.gapToLeaderSeconds)}
        </Stat>
        <Stat label={dictionary.driverSheet.ahead}>
          {formatGap(driver.intervalToAheadSeconds)}
        </Stat>

        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {dictionary.table.tire}
          </span>
          <TireCompoundView
            dictionary={dictionary}
            compound={driver.compound}
            tireAgeLaps={driver.tireAgeLaps}
          />
        </div>
        <Stat label={dictionary.driverSheet.lastLap}>
          {formatLapTime(driver.lastLapSeconds)}
        </Stat>
        <Stat label={dictionary.driverSheet.topSpeed}>
          {formatSpeed(driver.topSpeedKph)}
        </Stat>

        <div className="col-span-2 flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {dictionary.driverSheet.sectors}
          </span>
          <div className="flex">
            <SectorChipsView
              sectors={driver.lastSectorsSeconds}
              fieldBest={fieldBestSectors}
            />
          </div>
        </div>
        <Stat label={dictionary.driverSheet.pitStops}>
          {String(driver.pitStopCount)}
        </Stat>
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
