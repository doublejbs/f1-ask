"use client";

import { BottomSheetView } from "@/components/BottomSheetView";
import { DriverAvatarView } from "@/components/DriverAvatarView";
import { EventCommentaryLineView } from "@/components/EventCommentaryLineView";
import { SectorChipsView } from "@/components/SectorChipsView";
import { TireCompoundView } from "@/components/TireCompoundView";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dictionary } from "@/i18n/Messages";
import { translateRaceEvent } from "@/i18n/TranslateRaceEvent";
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
  parseTimestampMs,
} from "@/lib/TeamRadio";
import {
  AiCommentary,
  LiveDriverState,
  RaceEvent,
  RaceEventPriority,
  SupportedLocale,
  TeamRadioClip,
  attachCommentary,
  filterEventsByDriver,
} from "@f1/domain";
import {
  ChevronUp,
  Disc3,
  Flag,
  Gauge,
  History,
  Pause,
  Play,
  Radio,
  Split,
  Timer,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  // 시트를 여는 대상 드라이버. null 이면 닫힘.
  driver: LiveDriverState | null;
  // 필드 전체 섹터 최속(퍼플 판정용).
  fieldBestSectors: (number | null)[];
  // 이 드라이버의 팀 라디오 클립(최신순). 비어 있으면 섹션을 렌더링하지 않는다.
  radioClips: TeamRadioClip[];
  playingRadioUrl: string | null;
  // 전체 이벤트. 이력 섹션이 이 드라이버 것만 골라 쓴다.
  allEvents: RaceEvent[];
  // 이벤트에 sourceEventId 로 결합되는 AI 해설.
  commentary: AiCommentary[];
  onToggleRadio: (url: string) => void;
  onClose: () => void;
  // "AI에게 질문" — 시트를 닫고 AI 탭으로 전환하며 질문을 제출한다.
  onAskAi: (driver: LiveDriverState) => void;
};

type ContentProps = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  driver: LiveDriverState;
  fieldBestSectors: (number | null)[];
  radioClips: TeamRadioClip[];
  playingRadioUrl: string | null;
  allEvents: RaceEvent[];
  commentary: AiCommentary[];
  onToggleRadio: (url: string) => void;
};

type FooterProps = {
  dictionary: Dictionary;
  driver: LiveDriverState;
  onAskAi: (driver: LiveDriverState) => void;
};

type RadioSectionProps = {
  dictionary: Dictionary;
  driverCode: string;
  clips: TeamRadioClip[];
  playingRadioUrl: string | null;
  onToggleRadio: (url: string) => void;
};

type EventHistorySectionProps = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  driver: LiveDriverState;
  allEvents: RaceEvent[];
  commentary: AiCommentary[];
};

type StatRowProps = {
  icon: LucideIcon;
  label: string;
  // 목록 마지막 행에는 헤어라인을 붙이지 않는다.
  divided?: boolean;
  children: ReactNode;
};

// 상세 시트에 표시할 드라이버 이벤트 상한. 시트가 무한정 길어지면 하단의
// "AI에게 질문" 버튼까지 스크롤이 멀어지므로 최근 몇 건만 남긴다.
const MAX_EVENTS_IN_DRIVER_SHEET = 6;

// 우선순위 점 색. Tailwind 퍼지 때문에 리터럴 클래스만 사용한다.
const getPriorityDotColor = (priority: RaceEventPriority): string => {
  switch (priority) {
    case RaceEventPriority.Critical:
      return "bg-red-400";
    case RaceEventPriority.High:
      return "bg-amber-400";
    case RaceEventPriority.Medium:
      return "bg-sky-400";
    default:
      return "bg-white/30";
  }
};

// 이 드라이버와 연관된 이벤트를 최신순으로 골라 상한만큼 자른다.
//
// 다중 차량 인시던트(`params.driverCodes: "BOR,LIN"`)는 `filterEventsByDriver`
// 가 코드 목록을 쉼표로 분해해 정확 일치로 보므로 양쪽 드라이버 이력에 모두 잡힌다.
// 순위 행 마커가 쓰는 `expandMultiCarEvents` 는 여기서 **쓰지 않는다** — 복제본이
// driverNumber 로도, params.driverCodes 로도 걸려 같은 인시던트가 두 번 나온다.
const selectDriverEventHistory = (
  events: readonly RaceEvent[],
  driver: LiveDriverState,
): RaceEvent[] =>
  filterEventsByDriver(events, driver.driverNumber, driver.code)
    .sort(
      (left, right) =>
        (parseTimestampMs(right.timestamp) ?? 0) -
        (parseTimestampMs(left.timestamp) ?? 0),
    )
    .slice(0, MAX_EVENTS_IN_DRIVER_SHEET);

// 드라이버 이벤트 이력 섹션 (docs/14-event-placement.md — 피드의 "시간순 이력"
// 조각이 옮겨 온 자리). 각 항목은 이벤트 문장 + AI 해설 한 겹이며,
// 해설이 목이면 EventCommentaryLineView 가 스스로 렌더를 생략한다.
// 이력이 없으면 섹션 자체를 그리지 않는다.
const DriverEventHistorySection = ({
  dictionary,
  locale,
  driver,
  allEvents,
  commentary,
}: EventHistorySectionProps) => {
  const rows = useMemo(
    () =>
      attachCommentary(selectDriverEventHistory(allEvents, driver), commentary),
    [allEvents, driver, commentary],
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="mt-5 flex flex-col">
      <div className="flex items-center gap-2 pb-1">
        <History
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span className="text-xs text-muted-foreground">
          {dictionary.driverSheet.eventHistory}
        </span>
      </div>

      <ul className="flex flex-col">
        {rows.map(({ event, commentary: eventCommentary }, index) => {
          const priorityLabel = dictionary.eventPriority[event.priority];

          return (
            <li
              key={event.id}
              className={cn(index < rows.length - 1 && "hairline")}
            >
              <div className="flex items-center gap-2.5 py-2.5 text-[15px] leading-snug">
                {/* 배지 대신 작은 컬러 점. 색에만 의존하지 않도록 라벨을 함께 남긴다. */}
                <span
                  role="img"
                  aria-label={priorityLabel}
                  title={priorityLabel}
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    getPriorityDotColor(event.priority),
                  )}
                />

                <span className="flex-1">
                  {translateRaceEvent(event, locale)}
                </span>

                <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {formatRadioClock(event.timestamp)}
                </span>
              </div>

              {eventCommentary !== null ? (
                <EventCommentaryLineView
                  dictionary={dictionary}
                  commentary={eventCommentary}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
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
  locale,
  driver,
  fieldBestSectors,
  radioClips,
  playingRadioUrl,
  allEvents,
  commentary,
  onToggleRadio,
}: ContentProps) => {
  const accent = teamColorHex(driver.teamColour) ?? "hsl(var(--border))";

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

      {/* 이 드라이버의 이벤트 이력. 없으면 섹션이 스스로 사라진다. */}
      <DriverEventHistorySection
        dictionary={dictionary}
        locale={locale}
        driver={driver}
        allEvents={allEvents}
        commentary={commentary}
      />
    </>
  );
};

// "AI에게 질문" — 시트의 주요 행동이라 스크롤 본문이 아니라 셸의 하단 고정 영역에 둔다.
const DriverAskAiFooter = ({ dictionary, driver, onAskAi }: FooterProps) => {
  const handleAskAi = () => {
    onAskAi(driver);
  };

  return (
    <Button type="button" onClick={handleAskAi} className="w-full">
      {dictionary.driverSheet.ask.replace("{code}", driver.code)}
    </Button>
  );
};

// 순위 행 탭 → 드라이버 상세 바텀 시트. 오버레이·닫기·스크롤 잠금·포커스는
// 공유 BottomSheetView 가 담당하고, 본문만 여기서 조립한다.
export const DriverDetailSheetView = ({
  dictionary,
  locale,
  driver,
  fieldBestSectors,
  radioClips,
  playingRadioUrl,
  allEvents,
  commentary,
  onToggleRadio,
  onClose,
  onAskAi,
}: Props) => (
  <BottomSheetView
    isOpen={driver !== null}
    onClose={onClose}
    titleId="driver-sheet-title"
    closeLabel={dictionary.driverSheet.close}
    footer={
      driver !== null ? (
        <DriverAskAiFooter
          dictionary={dictionary}
          driver={driver}
          onAskAi={onAskAi}
        />
      ) : undefined
    }
  >
    {driver !== null ? (
      <DriverDetailContent
        dictionary={dictionary}
        locale={locale}
        driver={driver}
        fieldBestSectors={fieldBestSectors}
        radioClips={radioClips}
        playingRadioUrl={playingRadioUrl}
        allEvents={allEvents}
        commentary={commentary}
        onToggleRadio={onToggleRadio}
      />
    ) : null}
  </BottomSheetView>
);
