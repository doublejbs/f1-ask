"use client";

import { CommentaryDetailSheetView } from "@/components/CommentaryDetailSheetView";
import { DriverDetailSheetView } from "@/components/DriverDetailSheetView";
import { DriverListView } from "@/components/DriverListView";
import { RaceSummaryView } from "@/components/RaceSummaryView";
import { SessionStatusStripView } from "@/components/SessionStatusStripView";
import { WatchNowLanesView } from "@/components/WatchNowLanesView";
import { WeatherChipView } from "@/components/WeatherChipView";
import { useTeamRadioPlayer } from "@/hooks/UseTeamRadioPlayer";
import { useWatchNowLanes } from "@/hooks/UseWatchNowLanes";
import { Dictionary } from "@/i18n/Messages";
import { expandMultiCarEvents } from "@/lib/ExpandMultiCarEvents";
import { computeFieldBestSectors } from "@/lib/Format";
import { groupWatchNowOverflowByDriver } from "@/lib/GroupWatchNowOverflow";
import { groupTeamRadiosByDriver, parseTimestampMs } from "@/lib/TeamRadio";
import {
  AiCommentary,
  Battle,
  ExplanationLevel,
  LiveDriverState,
  LiveRaceSnapshot,
  RaceEvent,
  SessionStatus,
  SupportedLocale,
  TeamRadioClip,
  selectBattles,
  selectDriverStateMarkers,
  selectOvertakeForecastsByChaser,
  selectRecentDriverEvents,
} from "@f1/domain";
import { RaceSummaryResponse } from "@f1/schemas";
import { useMemo, useState } from "react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  // 해설 상세 시트의 질문이 AI 요청에 실어 보낸다(AI 탭과 같은 설정값).
  explanationLevel: ExplanationLevel;
  snapshot: LiveRaceSnapshot;
  summary: RaceSummaryResponse | null;
  allEvents: RaceEvent[];
  commentary: AiCommentary[];
  // "지금 볼 것"의 세 번째 칸(내 드라이버)이 쓴다. 비어 있으면 그 칸이 접힌다.
  favoriteDriverNumbers: number[];
  isFavorite: (driverNumber: number) => boolean;
  onToggleFavorite: (driverNumber: number) => void;
  // 탭투애스크: AI 탭으로 전환하며 이 드라이버에 대한 질문을 제출한다.
  onSelectDriver: (driver: LiveDriverState) => void;
};

const EMPTY_RADIO_CLIPS: TeamRadioClip[] = [];

const EMPTY_BATTLES: Battle[] = [];

// 「경기」 탭 — 구 「지금」 + 「순위」를 합친 레이스 콘솔 (docs/13-race-console.md).
// 경기 요약(종료 시) → 세션 상태 스트립 → "지금 볼 것" → 날씨 칩 → 순위 목록.
// 시간순 이벤트 피드는 없다 (docs/14-event-placement.md) — 세션 상태는 스트립으로,
// 드라이버 이벤트는 순위 행 마커로, 이력은 피드 탭과 드라이버 상세 시트로 분해됐다.
// 최근 이벤트 페이저도 docs/24 로 빠져 순위가 화면 전체를 쓴다.
export const RaceTabView = ({
  dictionary,
  locale,
  explanationLevel,
  snapshot,
  summary,
  allEvents,
  commentary,
  favoriteDriverNumbers,
  isFavorite,
  onToggleFavorite,
  onSelectDriver,
}: Props) => {
  // 상세 시트는 모든 폭에서 목록 행 탭으로 열린다. 로컬 state 로 충분하다.
  const [selectedDriver, setSelectedDriver] = useState<LiveDriverState | null>(
    null,
  );

  // 해설 캡션 탭으로 열리는 상세 시트. selectedDriver 와 같은 패턴이며, 드라이버 시트
  // 위에 겹쳐 열린다(캡션이 그 시트의 이벤트 이력 안에 있으므로).
  const [selectedCommentary, setSelectedCommentary] =
    useState<AiCommentary | null>(null);

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

  // 추월 예측을 chaser 행에 인라인으로 붙인다 (docs/24). 예측 계산은 워커가 이미 했고
  // (스냅샷의 overtakeForecasts), 여기서는 행이 O(1) 로 찾도록 인덱싱만 한다.
  const forecastsByChaser = useMemo(
    () => selectOvertakeForecastsByChaser(snapshot.overtakeForecasts),
    [snapshot.overtakeForecasts],
  );

  // "지금 볼 것" 칸 3개. 감지기 인스턴스는 훅이 ref 로 붙들고 있으므로 여기서 다시
  // 만들거나 초기화하지 않는다.
  const watchNowLanes = useWatchNowLanes({
    snapshot,
    favoriteDriverNumbers,
  });

  // 칸에 못 올라간 신호는 버리지 않고 순위표 행 표시로 내려보낸다(docs/19 수용 기준 7).
  // 칸당 2줄이라는 좁은 예산의 근거가 "나머지는 행에서 볼 수 있다" 이므로, 이 연결이
  // 없으면 감지 결과의 상당수가 그냥 사라진다(실측상 프레임의 44.6% 에서 발생한다).
  const watchNowOverflowByDriver = useMemo(
    () => groupWatchNowOverflowByDriver(watchNowLanes),
    [watchNowLanes],
  );

  const selectedRadioClips =
    selectedDriver === null
      ? EMPTY_RADIO_CLIPS
      : (radiosByDriver.get(selectedDriver.driverNumber) ?? EMPTY_RADIO_CLIPS);

  const handleCloseSheet = () => {
    setSelectedDriver(null);
  };

  const handleCloseCommentarySheet = () => {
    setSelectedCommentary(null);
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
          data={summary.data}
          narrative={summary.narrative}
          drivers={snapshot.drivers}
        />
      ) : null}

      {/* 고정 헤더 그룹 — "지금 상황"(세션 상태 스트립)만 남는다 (docs/24 §상단 정리).
          최근 이벤트 페이저는 뺐다 — 순위표가 본체인 화면에서 상단을 밀어내는 값이
          없고, 이벤트 이력은 피드 탭이 담당한다. SC · 레드 플래그 같은 세션 상태는
          안전 정보라 유지한다.
          순위를 스크롤해도 남도록 상태바(z-40) 바로 아래에 sticky 로 붙는다.
          top 은 상태바 실측 높이 변수(--status-bar-height)를 그대로 쓴다.
          배경을 채워(+블러) 뒤로 흐르는 순위 행이 비쳐 글자가 겹치지 않게 한다.
          스트립이 렌더를 생략하면 :empty 가 되어 통째로 숨는다. */}
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
      </div>

      {/* "지금 볼 것" — 고정 헤더 **아래**, 순위표 **위**.

          위치를 이렇게 정한 이유는 셋이다.

          1. 고정 헤더 안에 넣지 않는다. 그 그룹은 상태바와 합쳐 높이 예산이 빠듯한데
             칸 3개는 그것만으로 예산을 다 쓴다. 스크롤하면 사라져야 하는
             내용이기도 하다 — 순위를 훑는 동안 화면 위쪽을 계속 점유할 이유가 없다.
          2. 순위표 위에 둔다. 감지 결과 중 칸에 못 올라간 나머지는 순위표 행 표시로 가므로
             (docs/19 수용 기준 7) 요약이 먼저 오고 전체가 뒤에 오는 순서가 맞다.
          (최신 이벤트 페이저와의 공존 논리는 docs/24 로 페이저가 빠지면서 사라졌다 —
          발표된 사건의 이력은 피드 탭이 담당한다.) */}
      <WatchNowLanesView
        dictionary={dictionary}
        lanes={watchNowLanes}
        drivers={snapshot.drivers}
        onSelectDriver={setSelectedDriver}
      />

      {snapshot.weather !== undefined ? (
        <WeatherChipView dictionary={dictionary} weather={snapshot.weather} />
      ) : null}

      {/* 컴팩트 행 목록(관심 드라이버 고정). 행 탭 → 상세 시트 → "AI에게 질문" */}
      <DriverListView
        dictionary={dictionary}
        drivers={snapshot.drivers}
        battles={battles}
        fieldBestSectors={fieldBestSectors}
        radiosByDriver={radiosByDriver}
        radioReferenceMs={raceClockMs}
        playingRadioUrl={playingUrl}
        markersByDriver={markersByDriver}
        recentEventsByDriver={recentEventsByDriver}
        watchNowOverflowByDriver={watchNowOverflowByDriver}
        forecastsByChaser={forecastsByChaser}
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
        onSelectCommentary={setSelectedCommentary}
      />

      {/* 해설 상세 시트. 드라이버 시트의 이벤트 이력에서 캡션을 탭하면 그 위에 겹쳐 열린다. */}
      <CommentaryDetailSheetView
        dictionary={dictionary}
        locale={locale}
        explanationLevel={explanationLevel}
        snapshot={snapshot}
        allEvents={allEvents}
        favoriteDriverNumbers={favoriteDriverNumbers}
        commentary={selectedCommentary}
        onClose={handleCloseCommentarySheet}
      />
    </div>
  );
};
