"use client";

import { DriverRowMarkerView } from "@/components/DriverRowMarkerView";
import { TireCompoundSize } from "@/components/TireCompoundSize";
import { TireCompoundView } from "@/components/TireCompoundView";
import { SectionView } from "@/components/ui/SectionView";
import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import {
  formatBattleGapSeconds,
  formatGapCompact,
  formatPositionChange,
  getPositionChangeColor,
  teamColorHex,
} from "@/lib/Format";
import { isRecentTeamRadio } from "@/lib/TeamRadio";
import { getTeamShortName } from "@/lib/TeamShortName";
import {
  Battle,
  DriverStateMarker,
  LiveDriverState,
  RaceEvent,
  TeamRadioClip,
} from "@f1/domain";
import { ChevronRight, Pause, Radio, Star } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  drivers: LiveDriverState[];
  // 도메인 셀렉터(selectBattles)가 고른 접전 쌍 전체. 전체 목록에서만 인라인 표시한다.
  battles: Battle[];
  // 드라이버 번호 → 팀 라디오 클립(최신순). 클립이 있는 드라이버만 담긴다.
  radiosByDriver: Map<number, TeamRadioClip[]>;
  // 최근 무전 판정 기준 시각(경기 시계). 리플레이에서도 올바르게 동작한다.
  radioReferenceMs: number;
  playingRadioUrl: string | null;
  // 드라이버 번호 → 지속 마커(페널티·조사). 도메인이 페널티를 먼저 담아 준다.
  markersByDriver: Map<number, DriverStateMarker[]>;
  // 드라이버 번호 → 경기 시계 창 안의 최신 순간 이벤트.
  recentEventsByDriver: Map<number, RaceEvent>;
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
  // 슬롯을 차지하는 지속 마커(우선순위가 높은 1건). 없으면 null.
  marker: DriverStateMarker | null;
  // 지속 마커가 없을 때만 슬롯에 뜨는 순간 이벤트. 없으면 null.
  recentEvent: RaceEvent | null;
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

// 순위 번호를 0 패딩 2자리로. 미정이면 "—".
const formatPosition = (position: number | null): string => {
  if (position === null) {
    return "—";
  }

  return String(position).padStart(2, "0");
};

// 레퍼런스 순위 행.
//   ▲3 01 ▌ANT            선두  ›
//            Mercedes ⬤3랩
const DriverRow = ({
  dictionary,
  driver,
  favorite,
  latestRadio,
  radioReferenceMs,
  playingRadioUrl,
  marker,
  recentEvent,
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
        "press relative flex h-14 cursor-pointer items-center gap-2 px-1 outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
        divided && "hairline",
        driver.retired && "opacity-45",
        // 배틀 쌍은 아주 옅은 앰버 틴트로 하나의 덩어리처럼 읽히게 한다.
        inBattle && (overrideRange ? "bg-amber-400/[0.06]" : "bg-amber-400/[0.03]"),
      )}
    >
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
            .replace("{gap}", formatBattleGapSeconds(battleWithAhead.gapSeconds))}
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
        // 44×44 터치 타깃은 유지하되 좌우 음수 마진으로 **레이아웃 발자국만** 28px 로
        // 줄인다. 별 글리프는 16px 뿐이라 시각적으로는 달라지지 않고, 여기서 확보한
        // 10px 이 좌측에 새로 생긴 등락 슬롯 폭으로 들어간다(이름 컬럼 폭 보존).
        // -mr-2 는 행 gap(8px)만큼만 먹어서 터치 영역이 등락 슬롯까지 침범하지 않는다.
        className="press -my-1 -ml-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-amber-400"
      >
        <Star
          className={cn("h-4 w-4", favorite && "fill-amber-400 text-amber-400")}
        />
      </button>

      {/* 등락 + 순위 번호. 등락은 순위 번호 왼쪽에 오되, 없을 때(`—`)도 폭이
          흔들리지 않도록 고정 폭 슬롯으로 항상 렌더한다. 둘을 한 컬럼으로 묶어
          행 gap 을 한 번만 소비한다. */}
      <span className="flex shrink-0 items-center gap-0.5">
        <span
          className={cn(
            "w-6 text-right text-[10px] font-bold leading-none tabular-nums",
            getPositionChangeColor(driver.positionChange),
          )}
        >
          {formatPositionChange(driver.positionChange)}
        </span>

        <span className="w-5 text-right text-base font-semibold leading-none tabular-nums text-muted-foreground">
          {formatPosition(driver.position)}
        </span>
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

          {/* 마커 슬롯. 코드 줄에 두는 이유: 이 줄에는 여백이 남지만 아래 팀명 줄은
              이미 빠듯하다. 슬롯을 행의 독립 컬럼으로 만들면 팀명 폭을 그만큼
              잠식해 잘림이 재발한다(네 번 재발한 지점이다).
              ml-auto 로 이름 컬럼 오른쪽 끝에 붙여 행마다 같은 x 위치에 온다. */}
          <span className="ml-auto flex items-center">
            <DriverRowMarkerView
              dictionary={dictionary}
              marker={marker}
              recentEvent={recentEvent}
            />
          </span>
        </span>

        {/* 비드가 컴파운드를 색·글자로 이미 구분해 주므로 예전의 `·` 구분자는 뺐다.
            구분자와 그 양쪽 gap 이 먹던 폭이 비드 자리로 들어간다. */}
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

          <TireCompoundView
            dictionary={dictionary}
            compound={driver.compound}
            tireAgeLaps={driver.tireAgeLaps}
            size={TireCompoundSize.Compact}
          />
        </span>
      </div>

      {/* 배틀 행은 큰 수치 자리를 앞차 간격에 내주고, 선두 갭은 아래 줄로 내려 유지한다.
          간격은 배틀에서 지금 움직이는 값이고, 선두 갭은 순위표의 기본 정보라 버리지 않는다. */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {battleWithAhead !== null ? (
          <>
            <span
              title={dictionary.driverSheet.ahead}
              className="flex items-center gap-1 leading-tight"
            >
              {battleWithAhead.isOverrideRange ? (
                <span
                  className="glass-chip rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-amber-300"
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
              {formatGapCompact(driver.gapToLeaderSeconds)}
            </span>
          </>
        ) : (
          // 배틀이 아니면 선두 갭 한 줄뿐이다(등락은 좌측 슬롯으로 이동했다).
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
        )}
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
  battles,
  radiosByDriver,
  radioReferenceMs,
  playingRadioUrl,
  markersByDriver,
  recentEventsByDriver,
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

  // 배틀 쌍을 드라이버 번호로 인덱싱한다. 한 드라이버가 앞차이자 뒤차일 수 있으므로 맵을 나눈다.
  const battlesByChasing = new Map<number, Battle>();
  const battlesByAhead = new Map<number, Battle>();

  for (const battle of battles) {
    battlesByChasing.set(battle.chasingDriver.driverNumber, battle);
    battlesByAhead.set(battle.aheadDriver.driverNumber, battle);
  }

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
                marker={findMarker(driver.driverNumber)}
                recentEvent={findRecentEvent(driver.driverNumber)}
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
              marker={findMarker(driver.driverNumber)}
              recentEvent={findRecentEvent(driver.driverNumber)}
              divided={index < drivers.length - 1}
              battleWithAhead={battlesByChasing.get(driver.driverNumber) ?? null}
              battleWithBehind={battlesByAhead.get(driver.driverNumber) ?? null}
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
