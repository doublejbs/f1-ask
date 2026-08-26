"use client";

import { Button } from "@/components/ui/Button";
import { Dictionary } from "@/i18n/Messages";
import { NextRace } from "@f1/domain";
import { CalendarClock, Flag, History, MapPin } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  dictionary: Dictionary;
  nextRace: NextRace | null;
  isLoading: boolean;
  onOpenArchive: () => void;
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
  nextRace,
  isLoading,
  onOpenArchive,
}: Props) => {
  const texts = dictionary.nextRace;

  const archiveButton = (
    <Button variant="outline" onClick={onOpenArchive}>
      <History className="mr-1.5 h-4 w-4" aria-hidden />
      {dictionary.noSession.action}
    </Button>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-start gap-4 py-10">
        <p className="animate-pulse text-sm text-muted-foreground">
          {texts.loading}
        </p>
      </div>
    );
  }

  if (nextRace === null) {
    return (
      <div className="flex flex-col items-start gap-4 py-10">
        <CalendarClock className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {texts.unavailable}
        </p>
        {archiveButton}
      </div>
    );
  }

  const location = [nextRace.countryName, nextRace.circuit]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(" · ");

  return (
    <div className="flex flex-col gap-5">
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
            {nextRace.gpName}
          </h1>
          {location.length > 0 ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {location}
            </p>
          ) : null}
        </div>

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

      <div>{archiveButton}</div>
    </div>
  );
};
