"use client";

import { CriticalBannerView } from "@/components/CriticalBannerView";
import { DriverDetailSheetView } from "@/components/DriverDetailSheetView";
import { DriverListView } from "@/components/DriverListView";
import { EventSheetView } from "@/components/EventSheetView";
import { LatestEventCardView } from "@/components/LatestEventCardView";
import { RaceSummaryView } from "@/components/RaceSummaryView";
import { SessionStatusStripView } from "@/components/SessionStatusStripView";
import { WeatherChipView } from "@/components/WeatherChipView";
import { DriverEventFilterTarget } from "@/hooks/UseDriverEventFilter";
import { useTeamRadioPlayer } from "@/hooks/UseTeamRadioPlayer";
import { Dictionary } from "@/i18n/Messages";
import { expandMultiCarEvents } from "@/lib/ExpandMultiCarEvents";
import { computeFieldBestSectors } from "@/lib/Format";
import { groupTeamRadiosByDriver, parseTimestampMs } from "@/lib/TeamRadio";
import {
  AiCommentary,
  Battle,
  LiveDriverState,
  LiveRaceSnapshot,
  RaceEvent,
  SessionStatus,
  SupportedLocale,
  TeamRadioClip,
  selectBattles,
  selectDriverStateMarkers,
  selectRecentDriverEvents,
} from "@f1/domain";
import { RaceSummaryResponse } from "@f1/schemas";
import { useMemo, useState } from "react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  snapshot: LiveRaceSnapshot;
  summary: RaceSummaryResponse | null;
  primaryEvents: RaceEvent[];
  allEvents: RaceEvent[];
  commentary: AiCommentary[];
  // 적용 중인 드라이버 이벤트 필터. 상태는 LiveDashboardView 가 소유한다
  // (데스크톱 EventFeedView 도 같은 필터를 써야 하기 때문).
  driverFilter: DriverEventFilterTarget | null;
  onFilterEventsByDriver: (driver: LiveDriverState) => void;
  onClearDriverFilter: () => void;
  isFavorite: (driverNumber: number) => boolean;
  onToggleFavorite: (driverNumber: number) => void;
  // 탭투애스크: AI 탭으로 전환하며 이 드라이버에 대한 질문을 제출한다.
  onSelectDriver: (driver: LiveDriverState) => void;
  // 탭투애스크: 이벤트에 연관된 드라이버로 질문을 제출한다.
  onSelectEvent: (event: RaceEvent) => void;
};

const EMPTY_RADIO_CLIPS: TeamRadioClip[] = [];

const EMPTY_BATTLES: Battle[] = [];

// 「경기」 탭 — 구 「지금」 + 「순위」를 합친 레이스 콘솔 (docs/13-race-console.md).
// 경기 요약(종료 시) → Critical 배너(sticky) → 날씨 칩 → 순위 목록.
// 이벤트 피드는 모바일에서 논모달 바텀 시트(EventSheetView)로 순위 위에 겹쳐
// 순위와 이벤트를 동시에 보게 한다. 데스크톱(lg)은 3컬럼이라 시트가 필요 없어
// LiveDashboardView 가 가운데 컬럼에 EventFeedView 를 직접 그린다.
export const RaceTabView = ({
  dictionary,
  locale,
  snapshot,
  summary,
  primaryEvents,
  allEvents,
  commentary,
  driverFilter,
  onFilterEventsByDriver,
  onClearDriverFilter,
  isFavorite,
  onToggleFavorite,
  onSelectDriver,
  onSelectEvent,
}: Props) => {
  // 상세 시트는 모든 폭에서 목록 행 탭으로 열린다. 로컬 state 로 충분하다.
  const [selectedDriver, setSelectedDriver] = useState<LiveDriverState | null>(
    null,
  );

  const fieldBestSectors = useMemo(
    () => computeFieldBestSectors(snapshot.drivers),
    [snapshot.drivers],
  );

  // 인라인 배틀 판정은 도메인 셀렉터를 그대로 재사용한다(인접·리타이어·피트·임계 규칙 일원화).
  // 목록은 상위 N쌍이 아니라 모든 쌍이 필요하므로 limit 을 드라이버 수로 넉넉히 준다.
  // 종료된 경기의 "접전"은 의미가 없어 표시하지 않는다.
  const battles = useMemo(() => {
    if (snapshot.status === SessionStatus.Finished) {
      return EMPTY_BATTLES;
    }

    return selectBattles(snapshot, snapshot.drivers.length);
  }, [snapshot]);

  const radioClips = snapshot.teamRadios ?? EMPTY_RADIO_CLIPS;

  // 오디오 소유권은 훅에 있다. 행과 시트 어디서 눌러도 한 번에 하나만 재생된다.
  const { playingUrl, togglePlay } = useTeamRadioPlayer(radioClips);

  const radiosByDriver = useMemo(
    () => groupTeamRadiosByDriver(radioClips),
    [radioClips],
  );

  // "최근"을 판정하는 기준 시각은 벽시계가 아니라 경기 시계(sourceUpdatedAt)다.
  // 리플레이는 과거 타임스탬프를 쓰므로 벽시계로 판정하면 무전·순간 이벤트가
  // 항상 창 밖으로 밀려 아무것도 뜨지 않는다.
  const raceClockMs = useMemo(
    () => parseTimestampMs(snapshot.sourceUpdatedAt) ?? Date.now(),
    [snapshot.sourceUpdatedAt],
  );

  // 다중 차량 인시던트 보정: 도메인 셀렉터는 코드→번호 매핑이 없어 첫 차량에만
  // 마커를 붙인다. UI 에는 로스터가 있으므로 셀렉터에 넣기 전에 차량 수만큼
  // 이벤트를 복제해 나머지 차량에도 마커가 붙게 한다.
  const markersByDriver = useMemo(
    () =>
      selectDriverStateMarkers(
        expandMultiCarEvents(allEvents, snapshot.drivers),
        raceClockMs,
      ),
    [allEvents, snapshot.drivers, raceClockMs],
  );

  const recentEventsByDriver = useMemo(
    () => selectRecentDriverEvents(allEvents, raceClockMs),
    [allEvents, raceClockMs],
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

  // 시트의 "이 드라이버 이벤트만 보기": 시트를 닫고 이벤트 피드를 좁힌다.
  const handleFilterEvents = (driver: LiveDriverState) => {
    setSelectedDriver(null);
    onFilterEventsByDriver(driver);
  };

  const isFinished = snapshot.status === SessionStatus.Finished;

  return (
    // 모바일에서는 이벤트 시트가 하단을 덮으므로 마지막 순위 행까지 스크롤로 닿게
    // 기본 스냅(45dvh) 만큼 아래를 비워 둔다. 데스크톱에는 시트가 없어 필요 없다.
    <div className="flex flex-col gap-4 pb-[45dvh] lg:pb-0">
      {/* 경기 요약은 종료된 세션에서만, 최상단에 둔다. */}
      {isFinished && summary !== null ? (
        <RaceSummaryView
          dictionary={dictionary}
          summary={summary}
          drivers={snapshot.drivers}
        />
      ) : null}

      {/* 활성 세션 상태 스트립. 활성 상태가 없으면 스스로 렌더하지 않는다. */}
      <SessionStatusStripView
        dictionary={dictionary}
        locale={locale}
        allEvents={allEvents}
        atMs={raceClockMs}
      />

      {/* 최신 주요 이벤트 1건 + AI 해설. 탭하면 해당 드라이버 상세 시트를 연다. */}
      <LatestEventCardView
        dictionary={dictionary}
        locale={locale}
        allEvents={allEvents}
        commentary={commentary}
        drivers={snapshot.drivers}
        atMs={raceClockMs}
        onSelectDriver={setSelectedDriver}
      />

      {/* Critical 배너는 순간 경보 전용이다(지속 상태는 위 스트립이 담당한다).
          순위 영역 상단에 sticky 로 붙어 스크롤해도 남는다. */}
      <div className="sticky top-2 z-20 empty:hidden">
        <CriticalBannerView
          dictionary={dictionary}
          locale={locale}
          allEvents={allEvents}
          onSelectEvent={onSelectEvent}
        />
      </div>

      {snapshot.weather !== undefined ? (
        <WeatherChipView dictionary={dictionary} weather={snapshot.weather} />
      ) : null}

      {/* 컴팩트 행 목록(관심 드라이버 고정). 행 탭 → 상세 시트 → "AI에게 질문" */}
      <DriverListView
        dictionary={dictionary}
        drivers={snapshot.drivers}
        battles={battles}
        radiosByDriver={radiosByDriver}
        radioReferenceMs={raceClockMs}
        playingRadioUrl={playingUrl}
        markersByDriver={markersByDriver}
        recentEventsByDriver={recentEventsByDriver}
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
        onFilterEvents={handleFilterEvents}
      />

      {/* 이벤트 + 해설. 모바일 전용 논모달 시트. */}
      <EventSheetView
        dictionary={dictionary}
        locale={locale}
        primaryEvents={primaryEvents}
        allEvents={allEvents}
        commentary={commentary}
        driverFilter={driverFilter}
        onClearDriverFilter={onClearDriverFilter}
        onSelectEvent={onSelectEvent}
      />
    </div>
  );
};
