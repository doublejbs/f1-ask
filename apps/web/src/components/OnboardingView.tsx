"use client";

import { Dictionary } from "@/i18n/Messages";
import { RosterDriver, RosterTeam } from "@f1/domain";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";

type Props = {
  dictionary: Dictionary;
  teams: RosterTeam[];
  isLoading: boolean;
  // 팀 + 그 팀 선수 1명 선택 완료.
  onComplete: (teamName: string, driverNumber: number) => void;
  onSkip: () => void;
};

const teamHex = (colour: string | null): string =>
  colour !== null && /^[0-9a-fA-F]{6}$/.test(colour) ? `#${colour}` : "#52525b";

// headshot 은 외부 이미지라 실패할 수 있다 — 실패·부재 시 드라이버 코드 배지로 폴백한다.
const DriverAvatar = ({
  driver,
  ring,
}: {
  driver: RosterDriver;
  ring: string;
}) => {
  const [failed, setFailed] = useState(false);
  const showImage = driver.headshotUrl !== null && !failed;

  return (
    <div
      className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white/[0.06]"
      style={{ boxShadow: `inset 0 0 0 2px ${ring}` }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={driver.headshotUrl ?? undefined}
          alt={driver.fullName}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-lg font-bold tracking-tight text-foreground">
          {driver.code}
        </span>
      )}
    </div>
  );
};

// 최초 진입 온보딩 오버레이 (docs 계획 §Phase 1). ①팀 그리드 → ②그 팀 선수 1명.
export const OnboardingView = ({
  dictionary,
  teams,
  isLoading,
  onComplete,
  onSkip,
}: Props) => {
  const texts = dictionary.onboarding;
  const [selectedTeam, setSelectedTeam] = useState<RosterTeam | null>(null);

  const isDriverStep = selectedTeam !== null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        {/* 헤더: 뒤로(선수 단계) + 건너뛰기 */}
        <div className="mb-5 flex items-center justify-between">
          {isDriverStep ? (
            <button
              type="button"
              onClick={() => setSelectedTeam(null)}
              className="press flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              {texts.back}
            </button>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={onSkip}
            className="press text-sm text-muted-foreground hover:text-foreground"
          >
            {texts.skip}
          </button>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {isDriverStep ? texts.driverTitle : texts.teamTitle}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {isDriverStep ? texts.driverSubtitle : texts.teamSubtitle}
        </p>

        <div className="mt-6 flex-1">
          {isLoading ? (
            <p className="animate-pulse py-16 text-center text-sm text-muted-foreground">
              {texts.loading}
            </p>
          ) : teams.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {texts.unavailable}
            </p>
          ) : isDriverStep && selectedTeam !== null ? (
            // 선수 단계 — 그 팀 두 선수.
            <div className="grid grid-cols-2 gap-3">
              {selectedTeam.drivers.map((driver) => (
                <button
                  key={driver.driverNumber}
                  type="button"
                  onClick={() =>
                    onComplete(selectedTeam.name, driver.driverNumber)
                  }
                  className="press flex flex-col items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 hover:bg-white/[0.06]"
                >
                  <DriverAvatar
                    driver={driver}
                    ring={teamHex(selectedTeam.colour)}
                  />
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-base font-bold tracking-tight text-foreground">
                      {driver.code}
                    </span>
                    <span className="text-center text-[11px] leading-tight text-muted-foreground">
                      {driver.fullName}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            // 팀 단계 — 팀 그리드.
            <div className="grid grid-cols-2 gap-3">
              {teams.map((team) => (
                <button
                  key={team.name}
                  type="button"
                  onClick={() => setSelectedTeam(team)}
                  className="press flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-left hover:bg-white/[0.06]"
                >
                  <span
                    className="h-9 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: teamHex(team.colour) }}
                    aria-hidden
                  />
                  <span className="text-sm font-semibold leading-tight text-foreground">
                    {team.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
