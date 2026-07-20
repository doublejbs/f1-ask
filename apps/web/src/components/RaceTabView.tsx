"use client";

import { DriverDetailSheetView } from "@/components/DriverDetailSheetView";
import { DriverListView } from "@/components/DriverListView";
import { LatestEventStackView } from "@/components/LatestEventStackView";
import { RaceSummaryView } from "@/components/RaceSummaryView";
import { SessionStatusStripView } from "@/components/SessionStatusStripView";
import { WeatherChipView } from "@/components/WeatherChipView";
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
  allEvents: RaceEvent[];
  commentary: AiCommentary[];
  isFavorite: (driverNumber: number) => boolean;
  onToggleFavorite: (driverNumber: number) => void;
  // 탭투애스크: AI 탭으로 전환하며 이 드라이버에 대한 질문을 제출한다.
  onSelectDriver: (driver: LiveDriverState) => void;
};

const EMPTY_RADIO_CLIPS: TeamRadioClip[] = [];

const EMPTY_BATTLES: Battle[] = [];

// 「경기」 탭 — 구 「지금」 + 「순위」를 합친 레이스 콘솔 (docs/13-race-console.md).
// 경기 요약(종료 시) → 세션 상태 스트립 → 최신 이벤트 카드 → Critical 배너(sticky)
// → 날씨 칩 → 순위 목록.
// 시간순 이벤트 피드는 없다 (docs/14-event-placement.md) — 세션 상태는 스트립으로,
// 드라이버 이벤트는 순위 행 마커로, 해설과 이력은 최신 이벤트 카드와
// 드라이버 상세 시트로 분해됐다. 순위가 화면 전체를 쓴다.
export const RaceTabView = ({
  dictionary,
  locale,
  snapshot,
  summary,
  allEvents,
  commentary,
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

  const isFinished = snapshot.status === SessionStatus.Finished;

  return (
    // 하단 여백은 떠 있는 탭바만 피하면 된다(LiveDashboardView 가 담당).
    <div className="flex flex-col gap-4">
      {/* 경기 요약은 종료된 세션에서만, 최상단에 둔다. */}
      {isFinished && summary !== null ? (
        <RaceSummaryView
          dictionary={dictionary}
          summary={summary}
          drivers={snapshot.drivers}
        />
      ) : null}

      {/* 고정 헤더 그룹 — "지금 상황"(세션 상태 스트립) + "방금 일어난 일"(이벤트 스택).
          순위를 스크롤해도 남도록 상태바(z-40) 바로 아래에 sticky 로 붙는다.
          top 은 상태바 실측 높이 변수(--status-bar-height)를 그대로 쓴다.
          배경을 채워(+블러) 뒤로 흐르는 순위 행이 비쳐 글자가 겹치지 않게 한다.
          두 자식 모두 렌더를 생략하면 :empty 가 되어 통째로 숨는다.
          높이 예산: 이 그룹 + 상태바가 뷰포트의 35% 를 넘지 않아야 한다. 그래서
          AI 해설은 여기 두지 않고(드라이버 상세 시트 전용), 스택 3번째 항목은
          세로가 짧은 기기에서 숨는다. */}
      {/* -mt-4 로 부모의 gap-4 를 상쇄한다. 고정됐을 때는 어차피 상태바에 붙으므로
          평소에도 붙여 두는 편이 일관되고, 높이 예산에서 16px 을 아낀다. */}
      <div className="sticky top-[var(--status-bar-height)] z-30 -mx-4 -mt-4 flex flex-col gap-1.5 bg-[hsl(var(--background)/0.82)] px-4 py-2 backdrop-blur-xl empty:hidden lg:mx-0 lg:px-0">
        {/* 활성 세션 상태 스트립. 활성 상태가 없으면 스스로 렌더하지 않는다. */}
        <SessionStatusStripView
          dictionary={dictionary}
          locale={locale}
          allEvents={allEvents}
          atMs={raceClockMs}
        />

        {/* 최근 주요 이벤트 최대 3건. 탭하면 해당 드라이버 상세 시트를 연다.
            Critical 배너는 이 스택에 흡수됐다 — 같은 이벤트를 두 번 보여주지 않고
            고정 영역 높이도 아낀다(Critical 항목은 붉은 틴트로 구분한다). */}
        <LatestEventStackView
          dictionary={dictionary}
          locale={locale}
          allEvents={allEvents}
          drivers={snapshot.drivers}
          atMs={raceClockMs}
          onSelectDriver={setSelectedDriver}
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
        locale={locale}
        driver={selectedDriver}
        fieldBestSectors={fieldBestSectors}
        radioClips={selectedRadioClips}
        playingRadioUrl={playingUrl}
        allEvents={allEvents}
        commentary={commentary}
        onToggleRadio={togglePlay}
        onClose={handleCloseSheet}
        onAskAi={handleAskAi}
      />
    </div>
  );
};
