"use client";

import { Dictionary } from "@/i18n/Messages";
import { TeammateVs, TeammateVsDriver } from "@f1/domain";
import { cn } from "@/lib/Utils";
import { useState } from "react";

type Props = {
  dictionary: Dictionary;
  vs: TeammateVs;
};

const teamHex = (colour: string | null): string =>
  colour !== null && /^[0-9a-fA-F]{6}$/.test(colour) ? `#${colour}` : "#52525b";

const Headshot = ({
  driver,
  ring,
}: {
  driver: TeammateVsDriver;
  ring: string;
}) => {
  const [failed, setFailed] = useState(false);
  const showImage = driver.headshotUrl !== null && !failed;

  return (
    <div
      className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white/[0.06]"
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
        <span className="text-base font-bold tracking-tight text-foreground">
          {driver.code}
        </span>
      )}
    </div>
  );
};

// 팀메이트 VS 대문 — 두 선수 헤드샷 + 올 시즌 4지표 비교 (docs 계획 §Phase 3).
export const TeammateVsView = ({ dictionary, vs }: Props) => {
  const texts = dictionary.vs;
  const ring = teamHex(vs.colour);
  const [left, right] = vs.drivers;

  const rows: Array<{ label: string; a: number; b: number }> = [
    { label: texts.points, a: left.points, b: right.points },
    { label: texts.headToHead, a: left.headToHead, b: right.headToHead },
    { label: texts.wins, a: left.wins, b: right.wins },
    { label: texts.podiums, a: left.podiums, b: right.podiums },
  ];

  const driverColumn = (driver: TeammateVsDriver) => (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <Headshot driver={driver} ring={ring} />
      <span className="text-sm font-bold tracking-tight text-foreground">
        {driver.code}
      </span>
    </div>
  );

  return (
    <section
      className="glass-float animate-fade-up overflow-hidden rounded-2xl"
      aria-label={vs.teamName}
    >
      {/* 팀 컬러 상단 띠 */}
      <div className="h-1" style={{ backgroundColor: ring }} aria-hidden />

      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">
            {vs.teamName}
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {texts.season}
          </span>
        </div>

        {/* 두 선수 + 가운데 VS */}
        <div className="flex items-center gap-2">
          {driverColumn(left)}
          <span className="shrink-0 px-1 text-xs font-bold tracking-wide text-muted-foreground">
            {texts.vsLabel}
          </span>
          {driverColumn(right)}
        </div>

        {/* 지표 비교 — 각 행에서 앞선 값을 강조 */}
        <div className="flex flex-col divide-y divide-white/[0.06]">
          {rows.map((row) => {
            const leftLeads = row.a > row.b;
            const rightLeads = row.b > row.a;

            return (
              <div
                key={row.label}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2"
              >
                <span
                  className={cn(
                    "text-center text-lg font-bold tabular-nums",
                    leftLeads ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {row.a}
                </span>
                <span className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {row.label}
                </span>
                <span
                  className={cn(
                    "text-center text-lg font-bold tabular-nums",
                    rightLeads ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {row.b}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
