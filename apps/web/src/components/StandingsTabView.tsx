"use client";

import { DriverDetailSheetView } from "@/components/DriverDetailSheetView";
import { DriverListView } from "@/components/DriverListView";
import { DriverTableView } from "@/components/DriverTableView";
import { TeamRadioView } from "@/components/TeamRadioView";
import { Dictionary } from "@/i18n/Messages";
import { computeFieldBestSectors } from "@/lib/Format";
import { LiveDriverState, LiveRaceSnapshot } from "@f1/domain";
import { useMemo, useState } from "react";

type Props = {
  dictionary: Dictionary;
  snapshot: LiveRaceSnapshot;
  isFavorite: (driverNumber: number) => boolean;
  onToggleFavorite: (driverNumber: number) => void;
  // 탭투애스크: AI 탭으로 전환하며 이 드라이버에 대한 질문을 제출한다.
  onSelectDriver: (driver: LiveDriverState) => void;
};

// 「순위」 탭.
// 모바일: 컴팩트 행 목록(DriverListView, 관심 드라이버 고정) → 팀 라디오. 행 탭 → 상세 시트.
// 데스크톱(lg): 기존 순위표(DriverTableView) 유지. 행 클릭 → 탭투애스크.
export const StandingsTabView = ({
  dictionary,
  snapshot,
  isFavorite,
  onToggleFavorite,
  onSelectDriver,
}: Props) => {
  // 상세 시트는 모바일 목록에서만 열린다. 로컬 state 로 충분하다.
  const [selectedDriver, setSelectedDriver] = useState<LiveDriverState | null>(
    null,
  );

  const fieldBestSectors = useMemo(
    () => computeFieldBestSectors(snapshot.drivers),
    [snapshot.drivers],
  );

  const handleCloseSheet = () => {
    setSelectedDriver(null);
  };

  // 시트의 "AI에게 질문": 시트를 닫고 AI 탭으로 전환하며 질문을 제출한다.
  const handleAskAi = (driver: LiveDriverState) => {
    setSelectedDriver(null);
    onSelectDriver(driver);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 모바일: 컴팩트 행 목록. 행 탭 → 상세 시트 */}
      <div className="lg:hidden">
        <DriverListView
          dictionary={dictionary}
          drivers={snapshot.drivers}
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite}
          onSelectDriver={setSelectedDriver}
        />
      </div>

      {/* 데스크톱: 기존 순위표. 행 클릭 → 탭투애스크 */}
      <div className="hidden lg:block">
        <DriverTableView
          dictionary={dictionary}
          drivers={snapshot.drivers}
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite}
          onSelectDriver={onSelectDriver}
        />
      </div>

      {snapshot.teamRadios !== undefined && snapshot.teamRadios.length > 0 ? (
        <TeamRadioView
          dictionary={dictionary}
          clips={snapshot.teamRadios}
          drivers={snapshot.drivers}
        />
      ) : null}

      <DriverDetailSheetView
        dictionary={dictionary}
        driver={selectedDriver}
        fieldBestSectors={fieldBestSectors}
        onClose={handleCloseSheet}
        onAskAi={handleAskAi}
      />
    </div>
  );
};
