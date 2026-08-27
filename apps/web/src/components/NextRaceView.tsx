"use client";

import { Button } from "@/components/ui/Button";
import { TeammateVsView } from "@/components/TeammateVsView";
import { useTeammateVs } from "@/hooks/UseTeammateVs";
import { Dictionary } from "@/i18n/Messages";
import { grandPrixTitle, NextRace, SupportedLocale } from "@f1/domain";
import { CalendarClock, Flag, History, MapPin, Settings } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  nextRace: NextRace | null;
  isLoading: boolean;
  // 응원 팀(있으면 VS 대문을 띄운다). 없으면 null.
  favoriteTeam: string | null;
  onOpenArchive: () => void;
  // 무세션 홈엔 상태바가 없어 설정 진입점(응원 팀 변경 등)을 여기 둔다.
  onOpenSettings: () => void;
};

// 선택 언어 기준 나라 시간대 + Intl 로케일. 다음 결승 시각을 그 나라 시간으로 보여 준다.
const LOCALE_ZONE: Record<SupportedLocale, { tz: string; tag: string }> = {
  [SupportedLocale.En]: { tz: "Europe/London", tag: "en-GB" },
  [SupportedLocale.Ko]: { tz: "Asia/Seoul", tag: "ko-KR" },
  [SupportedLocale.Ja]: { tz: "Asia/Tokyo", tag: "ja-JP" },
};

// 결승 시각을 "몇월 몇일 (요일) 몇시 시간대"로 로컬라이즈한다(선택 언어 나라 시간 기준).
const formatRaceDate = (iso: string, locale: SupportedLocale): string | null => {
  const ms = Date.parse(iso);

  if (Number.isNaN(ms)) {
    return null;
  }

  const zone = LOCALE_ZONE[locale];

  return new Intl.DateTimeFormat(zone.tag, {
    timeZone: zone.tz,
    weekday: "short",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(ms));
};

type Remaining = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isLive: boolean;
};

const computeRemaining = (targetMs: number, nowMs: number): Remaining => {
  const diff = targetMs - nowMs;

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isLive: true };
  }

  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
    isLive: false,
  };
};

// 결승 시작까지 매초 갱신되는 카운트다운. 벽시계 기준(다음 경기 시각은 절대 시각이라 안전).
const RaceCountdown = ({
  targetIso,
  dictionary,
}: {
  targetIso: string;
  dictionary: Dictionary;
}) => {
  const targetMs = Date.parse(targetIso);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const texts = dictionary.nextRace;

  if (Number.isNaN(targetMs)) {
    return null;
  }

  const remaining = computeRemaining(targetMs, nowMs);

  if (remaining.isLive) {
    return (
      <p className="text-lg font-bold text-primary">{texts.live}</p>
    );
  }

  const cells: Array<{ value: number; label: string }> = [
    { value: remaining.days, label: texts.days },
    { value: remaining.hours, label: texts.hours },
    { value: remaining.minutes, label: texts.minutes },
    { value: remaining.seconds, label: texts.seconds },
  ];

  return (
    <div className="flex items-stretch gap-2">
      {cells.map((cell, index) => (
        <div key={index} className="flex flex-col items-center">
          <div className="min-w-[3.25rem] rounded-xl bg-white/[0.06] px-2 py-2 text-center">
            <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
              {String(cell.value).padStart(2, "0")}
            </span>
          </div>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {cell.label}
          </span>
        </div>
      ))}
    </div>
  );
};

// 무세션 홈 — 다음 결승 정보 + 카운트다운 (docs 계획 §Phase 2). NoLiveSessionView 를 대체하되
// 기록 탭 진입 버튼은 유지한다. (VS 대문은 Phase 3 에서 이 아래에 슬롯으로 붙는다.)
export const NextRaceView = ({
  dictionary,
  locale,
  nextRace,
  isLoading,
  favoriteTeam,
  onOpenArchive,
  onOpenSettings,
}: Props) => {
  const texts = dictionary.nextRace;
  const vsState = useTeammateVs(favoriteTeam);

  const archiveButton = (
    <Button variant="outline" onClick={onOpenArchive}>
      <History className="mr-1.5 h-4 w-4" aria-hidden />
      {dictionary.noSession.action}
    </Button>
  );

  // VS 대문 — 응원 팀이 있고 시즌 데이터가 있으면 최상단에 띄운다(사용자 요청: 대문).
  const vsHero =
    vsState.vs !== null ? (
      <TeammateVsView dictionary={dictionary} vs={vsState.vs} />
    ) : null;

  // 다음 결승 섹션 — 로딩·없음·정상 3상태.
  const nextRaceSection = isLoading ? (
    <p className="animate-pulse py-6 text-sm text-muted-foreground">
      {texts.loading}
    </p>
  ) : nextRace === null ? (
    <div className="flex items-center gap-3 py-4 text-muted-foreground">
      <CalendarClock className="h-6 w-6" aria-hidden />
      <p className="text-sm leading-relaxed">{texts.unavailable}</p>
    </div>
  ) : (
    <NextRaceCard dictionary={dictionary} locale={locale} nextRace={nextRace} />
  );

  // 무세션 홈은 최상단 요소라 상단 세이프에어리어를 직접 확보한다(상태바가 없어 잘림 방지).
  return (
    <div className="flex flex-col gap-5 pt-safe">
      {/* 설정 진입점 — 응원 팀 변경 등(상태바가 없는 무세션 홈용). */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label={dictionary.settings.title}
          className="press rounded-full bg-white/[0.06] p-2 text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-5 w-5" aria-hidden />
        </button>
      </div>
      {vsHero}
      {nextRaceSection}
      <div>{archiveButton}</div>
    </div>
  );
};

// 다음 결승 카드(GP명·서킷·국가 + 날짜·시각 + 카운트다운).
const NextRaceCard = ({
  dictionary,
  locale,
  nextRace,
}: {
  dictionary: Dictionary;
  locale: SupportedLocale;
  nextRace: NextRace;
}) => {
  const texts = dictionary.nextRace;
  const raceDate = formatRaceDate(nextRace.dateStartIso, locale);
  const location = [nextRace.countryName, nextRace.circuit]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(" · ");

  return (
    <section className="glass-float animate-fade-up flex flex-col gap-4 rounded-2xl p-5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Flag className="h-3.5 w-3.5 text-primary" aria-hidden />
          {texts.title}
          {nextRace.round !== null ? (
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-muted-foreground">
              {texts.round.replace("{round}", String(nextRace.round))}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
            {grandPrixTitle(nextRace.circuit, locale)}
          </h1>
          {location.length > 0 ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {location}
            </p>
          ) : null}
        </div>

        {/* 결승 날짜·시각(요일 포함) — 선택 언어 나라 시간 기준 */}
        {raceDate !== null ? (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
            {raceDate}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 pt-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {texts.startsIn}
          </span>
          <RaceCountdown
            targetIso={nextRace.dateStartIso}
            dictionary={dictionary}
          />
        </div>
    </section>
  );
};
