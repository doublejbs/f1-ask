"use client";

import { Dictionary } from "@/i18n/Messages";
import {
  DRY_TIRE_ALLOCATION,
  remainingSetCount,
  remainingTirePossibilities,
  StintCompoundUse,
  summarizeRemainingRanges,
  TIRE_SET_COMPOUNDS,
  TireCompound,
  totalReturnedSets,
  WeekendFormat,
} from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  // 선택된 드라이버가 이번 세션에서 쓴 타이어 이력(시작 순서대로). 없으면 null.
  usedCompounds: StintCompoundUse[] | null;
};

// 컴파운드별 비드 색 — TireCompoundView 와 같은 톤(소프트 빨강·미디엄 앰버·하드 흰색).
const COMPOUND_DOT: Partial<Record<TireCompound, string>> = {
  [TireCompound.Soft]: "bg-red-500",
  [TireCompound.Medium]: "bg-amber-400",
  [TireCompound.Hard]: "bg-slate-100",
  [TireCompound.Intermediate]: "bg-emerald-400",
  [TireCompound.Wet]: "bg-sky-400",
};

const Dot = ({ compound }: { compound: TireCompound }) => (
  <span
    aria-hidden
    className={`h-2.5 w-2.5 shrink-0 rounded-full ${COMPOUND_DOT[compound] ?? "bg-slate-500"}`}
  />
);

// 드라이버 상세 시트의 타이어 전략 섹션 (사용자 결정 — 사용한 타이어 + 남은 타이어 경우의 수).
//
// **남은 타이어는 규정 기반 "경우의 수"다** — OpenF1 엔 타이어 할당·세트 ID 가 없어 정확한
// 잔여를 알 수 없고, 반납 컴파운드는 팀 선택이라 하나로 확정되지 않는다. 그래서 반납 규정만으로
// 계산 가능한 가능한 구성 범위를 보여 준다. 현재는 일반 주말 규정을 기준으로 하며, 퀄리·프랙티스
// 사용분은 아직 반영하지 않는다(주말 데이터 연동 시 정밀해진다) — 문구로 명시한다.
export const DriverTireStrategyView = ({ dictionary, usedCompounds }: Props) => {
  const texts = dictionary.tireStrategy;

  // MVP 는 일반 주말 규정 기준. 모든 반납이 끝난 시점(레이스)의 보유 세트로 경우의 수를 낸다.
  const format = WeekendFormat.Conventional;
  const returned = totalReturnedSets(format);
  const remainingTotal = remainingSetCount(format, returned);
  const possibilities = remainingTirePossibilities(format, returned);
  const ranges = summarizeRemainingRanges(possibilities);
  const allocation = DRY_TIRE_ALLOCATION[format];

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white/[0.03] p-3.5">
      <h3 className="text-[13px] font-semibold text-foreground">{texts.title}</h3>

      {/* 사용한 타이어 (이번 세션) */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {texts.usedTitle}
        </span>

        {usedCompounds === null || usedCompounds.length === 0 ? (
          <span className="text-[13px] text-muted-foreground">{texts.noData}</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {usedCompounds.map((use, index) => (
              <span
                key={`${use.compound}-${index}`}
                className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2 py-1 text-[12px] font-medium"
              >
                <Dot compound={use.compound} />
                {dictionary.compound[use.compound]}
                <span className="text-[10px] text-muted-foreground">
                  {use.startedNew ? texts.new : texts.used}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 남은 타이어 경우의 수 (규정 기반) */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {texts.remainingTitle}
        </span>

        <span className="text-[13px] font-semibold text-foreground">
          {texts.setsCount.replace("{count}", String(remainingTotal))}
          <span className="ml-1.5 font-normal text-muted-foreground">
            {texts.possibilities.replace("{count}", String(possibilities.length))}
          </span>
        </span>

        {/* 컴파운드별 가능한 범위 */}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {TIRE_SET_COMPOUNDS.map(({ key, compound }) => {
            const range = ranges[key];
            const label =
              range.min === range.max
                ? String(range.min)
                : `${range.min}–${range.max}`;

            return (
              <span
                key={key}
                className="flex items-center gap-1.5 text-[12px] tabular-nums"
              >
                <Dot compound={compound} />
                <span className="text-muted-foreground">
                  {dictionary.compound[compound]}
                </span>
                <span className="font-semibold text-foreground">{label}</span>
                <span className="text-[10px] text-muted-foreground/70">
                  / {allocation[key]}
                </span>
              </span>
            );
          })}
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground/70">
          {texts.note}
        </p>
      </div>
    </section>
  );
};
