"use client";

import { DriverDetailSheetView } from "@/components/DriverDetailSheetView";
import { DriverListView } from "@/components/DriverListView";
import { useTeamRadioPlayer } from "@/hooks/UseTeamRadioPlayer";
import { Dictionary } from "@/i18n/Messages";
import { computeFieldBestSectors } from "@/lib/Format";
import { groupTeamRadiosByDriver, parseTimestampMs } from "@/lib/TeamRadio";
import { LiveDriverState, LiveRaceSnapshot, TeamRadioClip } from "@f1/domain";
import { useMemo, useState } from "react";

type Props = {
  dictionary: Dictionary;
  snapshot: LiveRaceSnapshot;
  isFavorite: (driverNumber: number) => boolean;
  onToggleFavorite: (driverNumber: number) => void;
  // 탭투애스크: AI 탭으로 전환하며 이 드라이버에 대한 질문을 제출한다.
  onSelectDriver: (driver: LiveDriverState) => void;
};

const EMPTY_RADIO_CLIPS: TeamRadioClip[] = [];

// 「순위」 탭.
// 모든 폭에서 컴팩트 행 목록(DriverListView, 관심 드라이버 고정)을 쓴다. 행 탭 → 상세 시트.
//   팀 라디오는 별도 패널 대신 순위 행 인디케이터 + 상세 시트 섹션으로 통합했다.
// 데스크톱 3컬럼 레이아웃의 순위 컬럼은 1280px 뷰포트에서 실측 376px 이라
//   넓은 순위표(구 DriverTableView, min-width 860px)가 들어가지 않았다.
//   375px 기준으로 만든 이 목록이 그대로 맞으므로 폭별 분기 없이 하나만 렌더한다.
export const StandingsTabView = ({
  dictionary,
  snapshot,
  isFavorite,
  onToggleFavorite,
  onSelectDriver,
}: Props) => {
  // 상세 시트는 모든 폭에서 목록 행 탭으로 열린다. 로컬 state 로 충분하다.
  const [selectedDriver, setSelectedDriver] = useState<LiveDriverState | null>(
    null,
  );

  const fieldBestSectors = useMemo(
    () => computeFieldBestSectors(snapshot.drivers),
    [snapshot.drivers],
  );

  const radioClips = snapshot.teamRadios ?? EMPTY_RADIO_CLIPS;

  // 오디오 소유권은 훅에 있다. 행과 시트 어디서 눌러도 한 번에 하나만 재생된다.
  const { playingUrl, togglePlay } = useTeamRadioPlayer(radioClips);

  const radiosByDriver = useMemo(
    () => groupTeamRadiosByDriver(radioClips),
    [radioClips],
  );

  // 최근 무전 판정 기준은 경기 시계(sourceUpdatedAt)다. 리플레이는 과거 타임스탬프를
  // 쓰므로 벽시계로 판정하면 항상 "오래된 무전"이 된다.
  const radioReferenceMs = useMemo(
    () => parseTimestampMs(snapshot.sourceUpdatedAt) ?? Date.now(),
    [snapshot.sourceUpdatedAt],
  );

  const selectedRadioClips =
    selectedDriver === null
      ? EMPTY_RADIO_CLIPS
      : (radiosByDriver.get(selectedDriver.driverNumber) ?? EMPTY_RADIO_CLIPS);

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
      {/* 컴팩트 행 목록. 행 탭 → 상세 시트 → "AI에게 질문" */}
      <DriverListView
        dictionary={dictionary}
        drivers={snapshot.drivers}
        radiosByDriver={radiosByDriver}
        radioReferenceMs={radioReferenceMs}
        playingRadioUrl={playingUrl}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        onToggleRadio={togglePlay}
        onSelectDriver={setSelectedDriver}
      />

      <DriverDetailSheetView
        dictionary={dictionary}
        driver={selectedDriver}
        fieldBestSectors={fieldBestSectors}
        radioClips={selectedRadioClips}
        playingRadioUrl={playingUrl}
        onToggleRadio={togglePlay}
        onClose={handleCloseSheet}
        onAskAi={handleAskAi}
      />
    </div>
  );
};
