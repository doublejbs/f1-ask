"use client";

import { DriverRowMarkerView } from "@/components/DriverRowMarkerView";
import { SectorChipView } from "@/components/SectorChipView";
import { TireCompoundSize } from "@/components/TireCompoundSize";
import { TireCompoundView } from "@/components/TireCompoundView";
import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import {
  formatBattleGapSeconds,
  formatGapCompact,
  formatLapTime,
  formatPositionChange,
  formatSpeed,
  getPositionChangeColor,
  teamColorHex,
} from "@/lib/Format";
import { isRecentTeamRadio } from "@/lib/TeamRadio";
import { getTeamShortName } from "@/lib/TeamShortName";
import {
  Battle,
  DriverStateMarker,
  LaneWatchNowSignal,
  LiveDriverState,
  RaceEvent,
  TeamRadioClip,
} from "@f1/domain";
import { ChevronRight, Pause, Radio, Star } from "lucide-react";

// ─── 열 폭 상수 ────────────────────────────────────────────────────────────
// 헤더 행과 데이터 행이 **같은 상수**를 써야 열이 어긋나지 않는다.
// 목록 전체가 스크롤 컨테이너 하나를 공유하고, 식별 열만 sticky 로 얼려 둔다
// (freeze pane). 행마다 스크롤을 JS 로 동기화하지 않으므로 어긋날 여지가 없다.

// 갭 열 68px. 배틀 행이 최악 케이스다 — OT 칩(px-1 로 좁힌 뒤 25.0) + gap-0.5 2 +
// "0.9s" text-lg 38.7 = 65.7px. 비배틀 최댓값은 "+99.9" 52.2px 이라 훨씬 여유롭다
// (formatGapCompact 는 100초 이상이면 소수를 떼므로 5글자를 넘지 않는다).
// 갭은 핵심 수치라 수치 자체의 text-lg 는 그대로 두고, 칩 패딩과 칩·수치 사이
// 간격에서만 폭을 회수했다.
const GAP_COLUMN_CLASS = "w-[4.25rem]";
// 열 폭 = 내용 최댓값 + 좌측 여백. 데이터 셀은 모두 justify-end 라 남는 폭이 전부
// 셀 왼쪽에 몰리고, 그 여백이 곧 **앞 열과의 시각적 간격**이 된다. 내용에 딱 맞게
// 자르면 앞 열 값과 글자가 맞붙어 읽을 수 없다(실측으로 확인한 실패 사례다).
// 타이어 열 52px = 내용 47.5(비드 20 + gap 4 + 랩 수 23.5 — ko "12랩" / ja "12周",
// en "12L" 은 20.3 이라 더 좁다) + 좌측 여백 4.5. 헤더 라벨("타이어"/"タイヤ" 31.2)도 들어간다.
const TIRE_COLUMN_CLASS = "w-[3.25rem]";
// 최근 랩 열 68px = 내용 63.3("1:23.456" text-sm tabular-nums) + 좌측 여백 4.7.
// tabular-nums 라 자릿수만 같으면 폭이 고정이고, F1 랩 타임은 세이프티카 상황에서도
// M:SS.mmm 8글자를 넘지 않아 63.3 이 곧 상한이다.
const LAST_LAP_COLUMN_CLASS = "w-[4.25rem]";
// 3자리 km/h + "SPEED" 헤더 라벨을 담는 폭.
const TOP_SPEED_COLUMN_CLASS = "w-[3.25rem]";
const PIT_COLUMN_CLASS = "w-[2.5rem]";
// 섹터 칩 1개(min-w 3.25rem) + 좌우 숨 쉴 틈. S1/S2/S3 를 각각 한 열로 쓴다.
const SECTOR_COLUMN_CLASS = "w-[3.75rem]";
const SECTOR_INDEXES = [0, 1, 2];
// 시크론은 우측 가장자리에 sticky 로 얼린다. 행 탭 어포던스가 스크롤로 사라지면 안 된다.
// 20px = 아이콘 16px + 좌우 2px. 이 열은 스크롤 창에서 통째로 빠지는 폭이라
// 아이콘이 들어가는 최소치까지 줄인다(목록 바깥에 페이지 여백 16px 이 따로 있어
// 시크론이 화면 가장자리에 붙어 보이지 않는다).
const CHEVRON_COLUMN_CLASS = "w-5";

// 고정 식별 열 폭 152px. **내용에서 역산한 고정값**이다.
//
// 예전에는 min(calc(100cqw-9.5rem), 13rem) 이었지만 375px 이상에서는 항상 13rem
// 상한이 이겨서 사실상 208px 고정이었고(뷰포트 식은 375px 에서도 205px 이라 상한을
// 넘지 못한다), 그보다 좁은 폭에서는 반대로 고정 열이 내용 최소치 아래로 줄어 팀명·코드가
// 잘릴 수 있었다. 상한이 늘 이기는 식이라면 상한 자체가 값이므로, 컨테이너 쿼리를 버리고
// 내용 최소치를 그대로 폭으로 쓴다 — 어떤 뷰포트에서도 잘리지 않는다.
//
// 152 = 고정 요소 69 + 이름 컬럼 83.
//   고정 요소 69 = pl-0.5 2 + 별 발자국 16 + gap 2 + 등락·순위 42 + gap 2
//                  + 팀 액센트 바 3 + gap 2
//   이름 컬럼 83 은 두 줄의 실측 최댓값을 모두 덮는다.
//     코드 줄  = 코드 + 마커 슬롯 36 → 코드 몫 47px.
//               3글자 대문자의 **이론적** 최댓값 "WWW" 가 text-base 에서 46.3px 이라
//               어떤 코드가 와도 넘치지 않는다(실제 그리드 최장은 "HAM" 36.6px).
//               VER(30.5)만 보고 폭을 잡았다가 HAM(36.6)이 넘친 적이 있어 이론 최댓값으로 잡는다.
//     팀명 줄  = 팀명 + gap 2 + 라디오 발자국 16 → 팀명 몫 65px.
//               최장 표기 "Mercedes" 58.1px → 6.9px 여유
//   이 아래로 더 좁히면 코드가 이론 최댓값을 못 담는다. 여기가 하한이다.
//
// 마커 슬롯(36px)을 스크롤 열로 내보내는 안은 실측 후 버렸다. 슬롯이 빠지면 코드 줄이
// 48.5 로 줄어 이름 컬럼 하한이 팀명 58.1 로 내려가므로 고정 열은 26px 만 좁아지는데,
// 스크롤 영역에서는 36px 를 새로 먹는다 — **스크롤 창이 오히려 10px 줄어드는** 손해다.
// 게다가 페널티·조사는 항상 보여야 할 상태 정보라 가로로 밀리면 사라지는 스크롤 열보다
// 절대 사라지지 않는 고정 열이 맞다. 지금 배치(코드 줄 여백에 얹기)가 최적 패킹이다.
const FROZEN_COLUMN_CLASS = "w-[9.5rem]";

// 얼린 열이 스크롤 콘텐츠를 가리려면 불투명해야 한다. 배경은 목록 전체가
// bg-background 로 통일돼 있어 이음매가 보이지 않는다.
const FROZEN_SURFACE_CLASS = "sticky z-10 shrink-0 bg-background";

// 얼린 열의 불투명 배경(bg-background)이 행의 반투명 호버 레이어를 가린다. 같은
// 레이어를 얼린 열 안쪽에서 한 번 더 깔아 호버 강조가 행 전체에 이어지게 한다.
// hoverOnlyWhenSupported 로 포인터가 있는 환경(데스크톱)에서만 적용된다 —
// 모바일에서는 아무 배경도 생기지 않는다.
const FROZEN_HOVER_CLASS = "group-hover:bg-white/[0.03]";

// 방향키 한 번에 밀리는 폭. 가장 넓은 데이터 열(갭 68px)과 맞춰 한 번 누르면
// 한 열이 넘어가게 한다.
const COLUMN_SCROLL_STEP_PX = 68;

// 신호가 없는 드라이버가 공유하는 빈 배열. 행마다 `[]` 를 새로 만들면 identity 가
// 매번 달라져 행이 무의미하게 재조정된다(대부분의 행이 이 경우다).
const EMPTY_WATCH_NOW_SIGNALS: LaneWatchNowSignal[] = [];

type Props = {
  dictionary: Dictionary;
  drivers: LiveDriverState[];
  // 도메인 셀렉터(selectBattles)가 고른 접전 쌍 전체. 전체 목록에서만 인라인 표시한다.
  battles: Battle[];
  // 필드 전체 최근 랩 기준 섹터 최속. 섹터 열의 퍼플 판정에 쓴다.
  fieldBestSectors: (number | null)[];
  // 드라이버 번호 → 팀 라디오 클립(최신순). 클립이 있는 드라이버만 담긴다.
  radiosByDriver: Map<number, TeamRadioClip[]>;
  // 최근 무전 판정 기준 시각(경기 시계). 리플레이에서도 올바르게 동작한다.
  radioReferenceMs: number;
  playingRadioUrl: string | null;
  // 드라이버 번호 → 지속 마커(페널티·조사). 도메인이 페널티를 먼저 담아 준다.
  markersByDriver: Map<number, DriverStateMarker[]>;
  // 드라이버 번호 → 경기 시계 창 안의 최신 순간 이벤트.
  recentEventsByDriver: Map<number, RaceEvent>;
  // 드라이버 번호 → "지금 볼 것" 칸에서 밀려난 신호들 (docs/19 수용 기준 7).
  // 신호가 없는 드라이버는 담기지 않는다.
  watchNowOverflowByDriver: Map<number, LaneWatchNowSignal[]>;
  isFavorite: (driverNumber: number) => boolean;
  onToggleFavorite: (driverNumber: number) => void;
  onToggleRadio: (url: string) => void;
  onSelectDriver: (driver: LiveDriverState) => void;
};

type RowProps = {
  dictionary: Dictionary;
  driver: LiveDriverState;
  fieldBestSectors: (number | null)[];
  favorite: boolean;
  // 이 드라이버의 최신 클립. 없으면 null.
  latestRadio: TeamRadioClip | null;
  radioReferenceMs: number;
  playingRadioUrl: string | null;
  // 슬롯을 차지하는 지속 마커(우선순위가 높은 1건). 없으면 null.
  marker: DriverStateMarker | null;
  // 지속 마커가 없을 때만 슬롯에 뜨는 순간 이벤트. 없으면 null.
  recentEvent: RaceEvent | null;
  // 칸에서 밀려난 "지금 볼 것" 신호들. 마커와 자리를 다투지 않고 슬롯 위에 얹힌다.
  watchNowSignals: LaneWatchNowSignal[];
  // 목록 마지막 행에는 헤어라인을 붙이지 않는다.
  divided: boolean;
  // 이 드라이버가 "뒤차"인 배틀(= 앞차와의 접전). 간격 수치와 OT 칩은 이 행에 붙는다.
  // 간격은 뒤차의 intervalToAheadSeconds 이므로 수치의 주인이 곧 뒤차다.
  battleWithAhead: Battle | null;
  // 이 드라이버가 "앞차"인 배틀(= 뒤차와의 접전). 액센트 바를 아래 행까지 잇는 데만 쓴다.
  battleWithBehind: Battle | null;
  onToggleFavorite: (driverNumber: number) => void;
  onToggleRadio: (url: string) => void;
  onSelectDriver: (driver: LiveDriverState) => void;
};

type HeaderRowProps = {
  dictionary: Dictionary;
  title: string;
};

type DataCellProps = {
  // 열 폭 상수.
  widthClass: string;
  // 스크린리더가 값과 열을 잇도록 값 앞에 싣는 긴 라벨(driverSheet 표기).
  label: string;
  className?: string;
  children: React.ReactNode;
};

// 순위 번호를 0 패딩 2자리로. 미정이면 "—".
const formatPosition = (position: number | null): string => {
  if (position === null) {
    return "—";
  }

  return String(position).padStart(2, "0");
};

// 스크롤 영역의 데이터 셀. 헤더 행은 시각용이고(세로 스크롤하면 화면 밖으로 나간다),
// 값과 열의 연결은 이 sr-only 라벨이 보장한다. 라벨은 폭 제약이 없는 driverSheet
// 긴 표기를 쓴다 — 행 전체가 role=button 이라 셀 라벨이 행 이름에 합쳐져 읽힌다.
const DataCell = ({ widthClass, label, className, children }: DataCellProps) => (
  <div
    // 헤더 행은 세로로 스크롤하면 화면 밖으로 나간다. 포인터 환경에서는 title 이
    // 그 자리를 메우고, 스크린리더는 아래 sr-only 라벨로 값과 열을 잇는다.
    title={label}
    className={cn(
      "flex shrink-0 snap-start items-center justify-end tabular-nums",
      widthClass,
      className,
    )}
  >
    <span className="sr-only">{label}</span>

    {children}
  </div>
);

// 섹션 제목 + 데이터 열 제목을 한 줄에 담는 헤더 행.
// 제목은 고정 열 안에(sticky left) 두어 가로 스크롤에도 남고, 열 라벨은 데이터 열과
// 같은 폭 상수를 써서 아래 행들과 정확히 정렬된다.
// 세로 sticky 를 걸지 않는 이유: 가로 스크롤 컨테이너가 sticky 의 스크롤포트가 되므로
// 컨테이너 안에서는 뷰포트에 붙일 수 없고, 밖에 두면 scrollLeft 를 JS 로 동기화해야
// 한다(이번에 피하기로 한 방식). 대신 각 데이터 셀에 sr-only 라벨을 실었다.
const HeaderRow = ({ dictionary, title }: HeaderRowProps) => {
  // items-stretch 로 두어야 sticky 셀이 행 높이를 다 채운다. 높이가 0 이면 불투명
  // 배경이 생기지 않아 옆 열의 라벨이 그대로 비쳐 보인다.
  const labelClass =
    "flex shrink-0 items-end justify-end text-label font-bold uppercase text-muted-foreground";

  return (
    <div className="flex h-7 w-max items-stretch">
      <div className={cn(FROZEN_SURFACE_CLASS, "left-0", FROZEN_COLUMN_CLASS)}>
        <div className="flex h-full items-end pl-1">
          <h2 className="text-label font-bold uppercase text-muted-foreground">
            {title}
          </h2>
        </div>
      </div>

      <div aria-hidden className={cn(labelClass, GAP_COLUMN_CLASS)}>
        {dictionary.table.columns.gap}
      </div>

      {/* 타이어는 갭 바로 다음이다. 컴파운드·스틴트 나이는 순위표에서 갭 다음으로 자주
          보는 값이고, 원래 고정 열에 있어 항상 보이던 값이라 스크롤 열로 옮긴 뒤에도
          스크롤 0 에서 그대로 보이는 자리에 둬야 체감 회귀가 없다. */}
      <div aria-hidden className={cn(labelClass, TIRE_COLUMN_CLASS)}>
        {dictionary.table.tire}
      </div>

      <div aria-hidden className={cn(labelClass, LAST_LAP_COLUMN_CLASS)}>
        {dictionary.table.columns.lastLap}
      </div>

      <div aria-hidden className={cn(labelClass, TOP_SPEED_COLUMN_CLASS)}>
        {dictionary.table.columns.topSpeed}
      </div>

      <div aria-hidden className={cn(labelClass, PIT_COLUMN_CLASS)}>
        {dictionary.table.columns.pitStops}
      </div>

      {/* S1/S2/S3 는 F1 공통 표기라 로케일과 무관하다. 뜻은 각 셀의 sr-only 라벨이 전달한다. */}
      {SECTOR_INDEXES.map((index) => (
        <div
          key={index}
          aria-hidden
          className={cn(labelClass, "justify-center", SECTOR_COLUMN_CLASS)}
        >
          {`S${index + 1}`}
        </div>
      ))}

      {/* 시크론 열 자리. 데이터 행의 sticky 시크론과 폭을 맞춘다. */}
      <div
        aria-hidden
        className={cn(FROZEN_SURFACE_CLASS, "right-0", CHEVRON_COLUMN_CLASS)}
      />
    </div>
  );
};

// 레퍼런스 순위 행.
//   ▲3 01 ▌ANT            선두  ›
//            Mercedes ⬤3랩
// 좌측 식별 영역은 sticky left-0 으로 얼리고, 갭 이후 데이터 열만 가로로 흐른다.
const DriverRow = ({
  dictionary,
  driver,
  fieldBestSectors,
  favorite,
  latestRadio,
  radioReferenceMs,
  playingRadioUrl,
  marker,
  recentEvent,
  watchNowSignals,
  divided,
  battleWithAhead,
  battleWithBehind,
  onToggleFavorite,
  onToggleRadio,
  onSelectDriver,
}: RowProps) => {
  const accent = teamColorHex(driver.teamColour);
  const leading = driver.position === 1;
  // 연속 배틀(P3↔P4↔P5)에서는 한 행이 앞차이자 뒤차다. 두 배틀을 모두 반영한다.
  const inBattle = battleWithAhead !== null || battleWithBehind !== null;
  const overrideRange =
    (battleWithAhead?.isOverrideRange ?? false) ||
    (battleWithBehind?.isOverrideRange ?? false);
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
        // 높이는 h-14 로 **고정**한다. min-h 였을 때는 우측 갭 수치(text-lg)와
        // 배틀 둘째 줄이 내용 높이를 밀어 올려 마커·라디오·배틀 유무에 따라
        // 56.5~63px 로 들쭉날쭉했다. 고정 높이면 내용이 바뀌어도 행이 흔들리지 않는다.
        // 가장 높은 내용(배틀 우측 컬럼 45px)도 56px 안에 여유롭게 들어간다.
        // w-max: 행 폭은 열 폭 상수의 합이다. 모든 행이 같은 폭이라 열이 정렬된다.
        // 배틀 행에는 배경 틴트를 깔지 않는다. 검정 배경 위 3~6% 앰버는 회색빛
        // 하이라이트로 보여 "선택/호버된 행"과 구분되지 않았고, 연쇄 배틀이면
        // 여러 행이 한 덩어리로 선택된 것처럼 읽혔다. 배틀은 좌측 앰버 액센트 바 ·
        // 앞차 간격 수치 · OT 칩 · sr-only 설명만으로 표시한다.
        // press(scale 눌림)를 쓰지 않는다. 탭하면 상세 시트가 손가락 아래에
        // 오버레이를 깔아 이 행이 pointerup 을 받지 못하고 :active 가 해제되지
        // 않는다. 축소된 채로 굳어 "눌린 상태가 남는" 것처럼 보인다.
        // 시트가 열리는 것 자체가 충분한 피드백이다.
        "group relative flex h-14 w-max cursor-pointer items-stretch outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
        divided && "hairline",
        driver.retired && "opacity-45",
      )}
    >
      {/* ── 고정 식별 열 ── 별·등락·순위·팀 액센트·코드·팀명. 스크롤해도 남는다. */}
      <div className={cn(FROZEN_SURFACE_CLASS, "left-0", FROZEN_COLUMN_CLASS)}>
        <div
          // gap-1 → gap-0.5, pl-1 → pl-0.5. 고정 열을 208 → 152px 로 좁히면서 컬럼
          // 사이 여백에서 8px(gap 3군데 + 좌측 패딩)을 회수한다. 별·등락·액센트 바는
          // 모두 폭이 작은 글리프라 2px 이면 서로 붙어 보이지 않는다.
          className={cn(
            "relative flex h-full items-center gap-0.5 pl-0.5",
            FROZEN_HOVER_CLASS,
          )}
        >
          {/* 배틀 액센트 바는 행 좌측 가장자리에 붙는다. 고정 열 안에 두어야
              가로로 밀어도 제자리에 남는다. */}
          {inBattle ? (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute left-0 w-[2px]",
                overrideRange ? "bg-amber-400/70" : "bg-amber-400/30",
                // 쌍(또는 연속 배틀)의 바깥쪽 끝만 둥글게 잘라 두 행을 잇는 한 줄로 보이게 한다.
                battleWithAhead === null ? "top-1.5 rounded-t-full" : "top-0",
                battleWithBehind === null ? "bottom-1.5 rounded-b-full" : "bottom-0",
              )}
            />
          ) : null}

          {/* 배틀 강조가 색에만 의존하지 않도록 스크린리더용 문구를 함께 싣는다. */}
          {battleWithAhead !== null ? (
            <span className="sr-only">
              {dictionary.battles.chasingDescription
                .replace("{code}", battleWithAhead.aheadDriver.code)
                .replace(
                  "{gap}",
                  formatBattleGapSeconds(battleWithAhead.gapSeconds),
                )}
            </span>
          ) : null}

          {battleWithBehind !== null ? (
            <span className="sr-only">
              {dictionary.battles.aheadDescription
                .replace("{code}", battleWithBehind.chasingDriver.code)
                .replace(
                  "{gap}",
                  formatBattleGapSeconds(battleWithBehind.gapSeconds),
                )}
            </span>
          ) : null}

          <button
            type="button"
            onClick={handleToggleFavorite}
            aria-label={dictionary.table.favorite}
            aria-pressed={favorite}
            // 44×44 터치 타깃은 유지하되 좌우 음수 마진으로 **레이아웃 발자국만** 16px 로
            // 줄인다(-mx-3 → -mx-3.5). 별 글리프가 정확히 16px 이라 발자국을 여기까지
            // 줄여도 글리프는 온전히 보인다.
            // 터치 영역은 좌측으로 페이지 여백까지, 우측으로 등락 슬롯까지 넘치지만 둘 다
            // 탭 대상이 아니라(등락은 텍스트) 충돌하지 않는다 — 오히려 엄지 도달 범위가 는다.
            className="press -mx-3.5 -my-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-amber-400"
          >
            <Star
              className={cn(
                "h-4 w-4",
                favorite && "fill-amber-400 text-amber-400",
              )}
            />
          </button>

          {/* 등락 + 순위 번호. 등락은 순위 번호 왼쪽에 오되, 없을 때(`—`)도 폭이
              흔들리지 않도록 고정 폭 슬롯으로 항상 렌더한다. 둘을 한 컬럼으로 묶어
              행 gap 을 한 번만 소비한다.
              슬롯 폭은 실측 최댓값에 맞춘다. 등락은 "▲12"(text-[10px]) 21.6px 이라
              22px, 순위는 "20"(text-sm) 18.1px 이라 20px. 둘 사이 gap 은 없앤다 —
              글자 크기와 색이 확연히 달라 붙어 있어도 구분된다. 46 → 42px. */}
          <span className="flex shrink-0 items-center">
            <span
              className={cn(
                "w-[22px] text-right text-[10px] font-bold leading-none tabular-nums",
                getPositionChangeColor(driver.positionChange),
              )}
            >
              {formatPositionChange(driver.positionChange)}
            </span>

            <span className="w-5 text-right text-sm font-semibold leading-none tabular-nums text-muted-foreground">
              {formatPosition(driver.position)}
            </span>
          </span>

          <span
            className="h-9 w-[3px] shrink-0 rounded-full"
            style={{ backgroundColor: accent ?? "hsl(var(--border))" }}
            aria-hidden
          />

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {/* 코드 줄 = 코드 + 마커 슬롯. 라디오 버튼은 아래 팀명 줄로 내려보냈다.
                코드 · 라디오 · 마커 세 개를 한 줄에 몰면 이름 컬럼 하한이 코드 47 +
                gap 2 + 라디오 16 + 마커 36 = 101px 까지 올라가 고정 열을 좁힐 수 없다.
                두 줄로 나누면 하한이 83px(아래 계산)로 떨어지고, 라디오는 "팀 라디오"라
                팀명 옆이 오히려 의미상 맞다.
                text-lg → text-base: 코드 줄이 이름 컬럼 폭을 결정하는 병목이라
                여기서 줄인 폭이 그대로 고정 열 폭으로 돌아온다. 순위 번호를 text-sm 으로
                함께 낮췄으므로 코드는 여전히 고정 열에서 가장 큰 글자이자 유일한 bold 다.
                폭 검증: 이름 컬럼 83 - 마커 36 = 47px 이 코드 몫이다. 3글자 대문자
                조합의 이론적 최댓값 "WWW" 가 text-base 에서 46.3px 이므로 **어떤 코드가
                와도** 잘리지 않는다(실제 그리드 최장은 "HAM" 36.6px). */}
            <span className="flex min-w-0 items-center text-base font-bold leading-tight tracking-tight">
              {driver.code}

              {/* 마커 슬롯. ml-auto 로 이름 컬럼 오른쪽 끝에 붙여 행마다 같은 x 위치에 온다. */}
              <span className="ml-auto flex items-center">
                <DriverRowMarkerView
                  dictionary={dictionary}
                  marker={marker}
                  recentEvent={recentEvent}
                  watchNowSignals={watchNowSignals}
                />
              </span>
            </span>

            {/* 팀명 줄 = 팀명 + 라디오. 라디오는 팀명 바로 뒤에 붙는다("팀 라디오"라
                팀명 옆이 의미상 맞다).
                폭 검증: 이름 컬럼 83 - gap 2 - 라디오 발자국 16 = 65px 이 팀명 몫이고,
                최장 표기 "Mercedes" 가 58.1px 이라 6.9px 이 남는다. truncate 는
                그래도 남겨 둔다 — 새 팀이 들어와도 레이아웃이 깨지지 않는 안전망이다. */}
            <span className="flex min-w-0 items-center gap-0.5">
              <span
                className="truncate text-xs font-semibold leading-tight"
                style={{ color: accent ?? undefined }}
              >
                {/* 순위 행은 폭이 좁아 원본 팀명이 잘린다. 여기서는 짧은 표기를 쓴다.
                    (상세 시트는 공간이 충분해 원본 전체 이름을 유지한다) */}
                {getTeamShortName(driver.teamName)}
              </span>

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
                    // 별과 같은 방식으로 44×44 터치 타깃은 유지하고 레이아웃 발자국만
                    // 16px 로 줄인다(-mx-3 → -mx-3.5). 아이콘이 정확히 16px 이라
                    // 글리프는 온전히 보인다. shrink-0 이라 팀명이 아무리 길어도
                    // 라디오가 밀려나지 않고 팀명 쪽이 먼저 truncate 된다.
                    //
                    // **ml-auto 를 쓰면 안 된다.** 위 마커 슬롯처럼 오른쪽 끝으로 밀어
                    // 인디케이터를 세로로 정렬하고 싶지만, ml-auto 는 -ml-3.5 를 덮어써서
                    // 발자국이 16 → 30px 으로 늘고 그만큼 팀명 몫이 65 → 51px 로 줄어
                    // "Mercedes"(58.1)가 잘린다(실측으로 재발을 확인했다).
                    "press -mx-3.5 -my-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/5",
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
          </div>

          {/* 고정 열 우측 경계의 그림자. 배경이 순검정이라 스크롤 0 에서는(경계 오른쪽이
              빈 갭 열 여백이라) 보이지 않다가, 값이 경계 밑으로 들어오는 순간에만
              그 위를 어둡게 덮어 "여기서 얼어 있다"는 힌트가 된다. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -right-4 w-4 bg-gradient-to-r from-black via-black/55 to-transparent"
          />
        </div>
      </div>

      {/* ── 여기부터 가로로 흐르는 데이터 열 ── */}

      {/* 배틀 행은 큰 수치 자리를 앞차 간격에 내주고, 선두 갭은 아래 줄로 내려 유지한다.
          간격은 배틀에서 지금 움직이는 값이고, 선두 갭은 순위표의 기본 정보라 버리지 않는다. */}
      <div
        className={cn(
          "flex shrink-0 snap-start flex-col items-end justify-center gap-0.5",
          GAP_COLUMN_CLASS,
        )}
      >
        {battleWithAhead !== null ? (
          <>
            <span
              title={dictionary.driverSheet.ahead}
              // gap-1 → gap-0.5. 갭 열 폭을 결정하는 유일한 조합이라 여기서 2px 을 줄이면
              // 열 폭이 그대로 2px 줄어든다.
              className="flex items-center gap-0.5 leading-tight"
            >
              <span className="sr-only">{dictionary.driverSheet.ahead}</span>

              {battleWithAhead.isOverrideRange ? (
                <span
                  // px-1.5 → px-1. 칩 글자(text-[10px])는 그대로 두고 좌우 패딩만
                  // 줄여 29 → 25px. 갭 열이 가장 넓어지는 배틀 행의 병목이다.
                  className="glass-chip rounded-full px-1 py-px text-[10px] font-bold uppercase tracking-wide text-amber-300"
                  title={dictionary.battles.overtakeTitle}
                  aria-label={dictionary.battles.overtakeTitle}
                >
                  {dictionary.battles.overtakeLabel}
                </span>
              ) : null}

              <span
                className={cn(
                  "text-lg font-bold tabular-nums",
                  battleWithAhead.isOverrideRange
                    ? "text-amber-300"
                    : "text-foreground",
                )}
              >
                {formatBattleGapSeconds(battleWithAhead.gapSeconds)}s
              </span>
            </span>

            {/* 등락이 좌측으로 빠져서 이 작은 줄에는 선두 갭만 남는다. */}
            <span
              title={dictionary.driverSheet.leadGap}
              className="text-xs font-semibold leading-tight tabular-nums text-muted-foreground"
            >
              <span className="sr-only">{dictionary.driverSheet.leadGap}</span>

              {formatGapCompact(driver.gapToLeaderSeconds)}
            </span>
          </>
        ) : (
          // 배틀이 아니면 선두 갭 한 줄뿐이다(등락은 좌측 슬롯으로 이동했다).
          <span
            title={dictionary.driverSheet.leadGap}
            className={cn(
              "font-bold leading-tight tabular-nums",
              leading ? "text-sm text-muted-foreground" : "text-lg",
            )}
          >
            <span className="sr-only">{dictionary.driverSheet.leadGap}</span>

            {leading
              ? dictionary.table.leader
              : formatGapCompact(driver.gapToLeaderSeconds)}
          </span>
        )}
      </div>

      {/* 타이어. 고정 열 둘째 줄에 있던 비드 + 랩 수를 그대로 옮겨 왔다(상세 시트의
          기본 크기 비드는 손대지 않는다). 갭 다음 자리라 스크롤 0 에서 바로 보인다. */}
      <DataCell
        widthClass={TIRE_COLUMN_CLASS}
        label={dictionary.table.tire}
      >
        <TireCompoundView
          dictionary={dictionary}
          compound={driver.compound}
          tireAgeLaps={driver.tireAgeLaps}
          size={TireCompoundSize.Compact}
        />
      </DataCell>

      <DataCell
        widthClass={LAST_LAP_COLUMN_CLASS}
        label={dictionary.driverSheet.lastLap}
        className="text-sm font-semibold"
      >
        {formatLapTime(driver.lastLapSeconds)}
      </DataCell>

      <DataCell
        widthClass={TOP_SPEED_COLUMN_CLASS}
        label={dictionary.driverSheet.topSpeed}
        className="text-sm font-semibold text-muted-foreground"
      >
        {formatSpeed(driver.topSpeedKph)}
      </DataCell>

      <DataCell
        widthClass={PIT_COLUMN_CLASS}
        label={dictionary.driverSheet.pitStops}
        className="text-sm font-semibold text-muted-foreground"
      >
        {driver.pitStopCount}
      </DataCell>

      {/* 섹터는 스크롤 끝에 둔다(폭이 가장 크다). 칩 3개를 한 열에 묶으면 172px 이라
          모바일의 스크롤 창(≈ 갭 열 폭)에 한 번에 들어오지 않는다. S1/S2/S3 를
          독립 열로 쪼개면 한 열씩 창에 딱 들어와 읽을 수 있다. */}
      {SECTOR_INDEXES.map((index) => (
        <DataCell
          key={index}
          widthClass={SECTOR_COLUMN_CLASS}
          label={dictionary.table.columns.sector.replace(
            "{n}",
            String(index + 1),
          )}
          // 칩을 열 가운데에 두어 헤더의 S1/S2/S3 와 중심이 맞고, 이웃 칩과 8px 씩 벌어진다.
          className="justify-center"
        >
          <SectorChipView
            value={driver.lastSectorsSeconds?.[index] ?? null}
            best={fieldBestSectors[index] ?? null}
          />
        </DataCell>
      ))}

      {/* 시크론은 우측 가장자리에 얼린다 — 행을 아무리 밀어도 "탭하면 상세" 어포던스가 남는다. */}
      <div className={cn(FROZEN_SURFACE_CLASS, "right-0", CHEVRON_COLUMN_CLASS)}>
        <div
          className={cn(
            "flex h-full items-center justify-center pr-1",
            FROZEN_HOVER_CLASS,
          )}
        >
          <ChevronRight
            className="h-4 w-4 shrink-0 text-muted-foreground/50"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
};

// 모바일용 순위 목록. 카드 없이 헤어라인 행으로 나열한다.
// 관심 드라이버는 최상단 고정 섹션으로 분리하고, 전체 필드는 그 아래 순위 순으로 나열한다.
// 행 탭 → 상세 바텀 시트.
//
// 두 섹션이 **스크롤 컨테이너 하나**를 공유한다. 섹션마다 컨테이너를 나누면 관심
// 드라이버만 밀리고 전체 순위는 제자리인 어긋난 상태가 만들어진다.
export const DriverListView = ({
  dictionary,
  drivers,
  battles,
  fieldBestSectors,
  radiosByDriver,
  radioReferenceMs,
  playingRadioUrl,
  markersByDriver,
  recentEventsByDriver,
  watchNowOverflowByDriver,
  isFavorite,
  onToggleFavorite,
  onToggleRadio,
  onSelectDriver,
}: Props) => {
  const favorites = drivers.filter((driver) => isFavorite(driver.driverNumber));
  const findLatestRadio = (driverNumber: number): TeamRadioClip | null =>
    radiosByDriver.get(driverNumber)?.[0] ?? null;

  // 슬롯은 하나뿐이므로 지속 마커 중 앞의 것(도메인이 페널티를 먼저 담는다)만 쓴다.
  const findMarker = (driverNumber: number): DriverStateMarker | null =>
    markersByDriver.get(driverNumber)?.[0] ?? null;

  const findRecentEvent = (driverNumber: number): RaceEvent | null =>
    recentEventsByDriver.get(driverNumber) ?? null;

  const findWatchNowSignals = (driverNumber: number): LaneWatchNowSignal[] =>
    watchNowOverflowByDriver.get(driverNumber) ?? EMPTY_WATCH_NOW_SIGNALS;

  // 배틀 쌍을 드라이버 번호로 인덱싱한다. 한 드라이버가 앞차이자 뒤차일 수 있으므로 맵을 나눈다.
  const battlesByChasing = new Map<number, Battle>();
  const battlesByAhead = new Map<number, Battle>();

  for (const battle of battles) {
    battlesByChasing.set(battle.chasingDriver.driverNumber, battle);
    battlesByAhead.set(battle.aheadDriver.driverNumber, battle);
  }

  // 브라우저 기본 방향키 스크롤은 이 컨테이너에서 동작하지 않는다(실측). 키보드만
  // 쓰는 사용자도 열을 넘길 수 있어야 하므로 직접 처리한다. 행에 포커스가 있을 때는
  // 가로채지 않는다 — 컨테이너 자신이 포커스일 때만 반응한다.
  const handleScrollKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    const container = event.currentTarget;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      container.scrollLeft += COLUMN_SCROLL_STEP_PX;

      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      container.scrollLeft -= COLUMN_SCROLL_STEP_PX;

      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      container.scrollLeft = 0;

      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      container.scrollLeft = container.scrollWidth;
    }
  };

  return (
    // 고정 열이 내용 기반 고정 폭(FROZEN_COLUMN_CLASS)으로 바뀌면서 컨테이너 쿼리가
    // 필요 없어졌다 — container-type: inline-size 도 함께 걷어냈다.
    <div className="animate-fade-up">
      <div
        role="region"
        aria-label={dictionary.table.extraColumns}
        // 키보드만 쓰는 사용자도 방향키로 열을 넘길 수 있어야 한다(WCAG 2.1.1).
        tabIndex={0}
        onKeyDown={handleScrollKeyDown}
        // overscroll-x-contain: 좌측 끝에서 더 밀어도 브라우저 뒤로가기 제스처로 새지 않는다.
        // bg-background: 얼린 열의 불투명 배경과 목록 배경을 같은 색으로 맞춰 이음매를 없앤다.
        // snap-x proximity + scroll-padding-left(고정 열 폭 — FROZEN_COLUMN_CLASS 와
        // 반드시 같은 값이어야 한다): 손을 떼면 열이 고정 열 바로 오른쪽에 딱 맞게 선다.
        // 393px 기준 스크롤 창은 189px 이라 갭 68 + 타이어 52 + 최근 랩 68 = 188 이
        // 딱 들어오고, 열이 반쯤 걸치면 읽을 수 없으므로 스냅이 필요하다.
        // proximity 라 자유롭게 훑는 것도 방해하지 않는다.
        className="scrollbar-hidden snap-x scroll-pl-[9.5rem] overflow-x-auto overscroll-x-contain bg-background outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
      >
        <div className="flex w-max flex-col gap-5">
          {favorites.length > 0 ? (
            <div className="flex w-max flex-col gap-2">
              <HeaderRow
                dictionary={dictionary}
                title={dictionary.driverSheet.favorites}
              />

              {favorites.map((driver, index) => (
                <DriverRow
                  key={`fav-${driver.driverNumber}`}
                  dictionary={dictionary}
                  driver={driver}
                  fieldBestSectors={fieldBestSectors}
                  favorite
                  latestRadio={findLatestRadio(driver.driverNumber)}
                  radioReferenceMs={radioReferenceMs}
                  playingRadioUrl={playingRadioUrl}
                  marker={findMarker(driver.driverNumber)}
                  recentEvent={findRecentEvent(driver.driverNumber)}
                  watchNowSignals={findWatchNowSignals(driver.driverNumber)}
                  divided={index < favorites.length - 1}
                  // 고정 섹션은 순위가 연속이 아니라 인접 관계가 성립하지 않는다. 배틀 표시를 하지 않는다.
                  battleWithAhead={null}
                  battleWithBehind={null}
                  onToggleFavorite={onToggleFavorite}
                  onToggleRadio={onToggleRadio}
                  onSelectDriver={onSelectDriver}
                />
              ))}
            </div>
          ) : null}

          <div className="flex w-max flex-col gap-2">
            <HeaderRow dictionary={dictionary} title={dictionary.table.title} />

            {drivers.map((driver, index) => (
              <DriverRow
                key={driver.driverNumber}
                dictionary={dictionary}
                driver={driver}
                fieldBestSectors={fieldBestSectors}
                favorite={isFavorite(driver.driverNumber)}
                latestRadio={findLatestRadio(driver.driverNumber)}
                radioReferenceMs={radioReferenceMs}
                playingRadioUrl={playingRadioUrl}
                marker={findMarker(driver.driverNumber)}
                recentEvent={findRecentEvent(driver.driverNumber)}
                watchNowSignals={findWatchNowSignals(driver.driverNumber)}
                divided={index < drivers.length - 1}
                battleWithAhead={battlesByChasing.get(driver.driverNumber) ?? null}
                battleWithBehind={battlesByAhead.get(driver.driverNumber) ?? null}
                onToggleFavorite={onToggleFavorite}
                onToggleRadio={onToggleRadio}
                onSelectDriver={onSelectDriver}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
