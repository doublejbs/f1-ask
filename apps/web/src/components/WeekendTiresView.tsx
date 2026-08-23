"use client";

import { useWeekendTires } from "@/hooks/UseWeekendTires";
import { Dictionary } from "@/i18n/Messages";
import {
  distinctCompounds,
  TireCompound,
  WeekendSessionKind,
  WeekendTireSession,
} from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  meetingKey: number;
};

// 컴파운드 비드 색 (TireCompoundView 와 같은 톤).
const COMPOUND_DOT: Partial<Record<TireCompound, string>> = {
  [TireCompound.Soft]: "bg-red-500",
  [TireCompound.Medium]: "bg-amber-400",
  [TireCompound.Hard]: "bg-slate-100",
  [TireCompound.Intermediate]: "bg-emerald-400",
  [TireCompound.Wet]: "bg-sky-400",
};

// 세션 헤더 축약 — F1 공용 표기(로케일 무관). 프랙티스는 이름 끝 숫자로 FP1/2/3.
const shortSessionLabel = (session: WeekendTireSession): string => {
  switch (session.kind) {
    case WeekendSessionKind.Practice: {
      const match = session.name.match(/(\d+)/);

      return match ? `FP${match[1]}` : "FP";
    }
    case WeekendSessionKind.SprintQualifying:
      return "SQ";
    case WeekendSessionKind.Sprint:
      return "SPR";
    case WeekendSessionKind.Qualifying:
      return "Q";
    case WeekendSessionKind.Race:
      return "R";
    default:
      return "?";
  }
};

// 「기록」 상세의 주말 타이어 섹션 (docs/29 §범위 밖 → 구현).
//
// 드라이버 × 세션 격자로 "프랙티스·퀄리·레이스에서 쓴 compound" 를 보여 준다. OpenF1 은
// 세트 ID 가 없어 사용한 컴파운드까지가 한계다(남은 세트는 드라이버 상세의 경우의 수 — docs/29).
// 격자는 셀당 그 세션에서 쓴 **구별되는** 컴파운드 비드로 압축한다.
export const WeekendTiresView = ({ dictionary, meetingKey }: Props) => {
  const texts = dictionary.weekendTires;
  const { usage, isLoading, hasError } = useWeekendTires(meetingKey);

  const body = (() => {
    if (isLoading) {
      return (
        <p className="animate-pulse py-6 text-sm text-muted-foreground">
          {texts.loading}
        </p>
      );
    }

    if (hasError) {
      return <p className="py-6 text-sm text-muted-foreground">{texts.error}</p>;
    }

    if (usage === null || usage.drivers.length === 0) {
      return <p className="py-6 text-sm text-muted-foreground">{texts.empty}</p>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="sticky left-0 bg-background py-1.5 pr-3 text-left font-medium">
                {texts.driverColumn}
              </th>
              {usage.sessions.map((session) => (
                <th
                  key={session.sessionKey}
                  className="px-2 py-1.5 text-center font-semibold"
                  title={session.name}
                >
                  {shortSessionLabel(session)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {usage.drivers.map((driver) => (
              <tr
                key={driver.driverNumber}
                className="border-t border-white/[0.06]"
              >
                <td className="sticky left-0 bg-background py-1.5 pr-3 font-bold tracking-tight text-foreground">
                  {driver.code}
                </td>

                {usage.sessions.map((session) => {
                  const use = driver.sessions.find(
                    (entry) => entry.sessionKey === session.sessionKey,
                  );
                  const compounds =
                    use === undefined ? [] : distinctCompounds(use.compounds);

                  return (
                    <td key={session.sessionKey} className="px-2 py-1.5">
                      {compounds.length === 0 ? (
                        <span className="block text-center text-muted-foreground/40">
                          –
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1">
                          {compounds.map((compound) => (
                            <span
                              key={compound}
                              aria-label={dictionary.compound[compound]}
                              title={dictionary.compound[compound]}
                              className={`h-2.5 w-2.5 rounded-full ${COMPOUND_DOT[compound] ?? "bg-slate-500"}`}
                            />
                          ))}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  })();

  return (
    <section
      aria-label={texts.title}
      className="glass-float flex flex-col gap-2 rounded-2xl p-3.5"
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[13px] font-semibold text-foreground">
          {texts.title}
        </h3>
        <p className="text-[11px] text-muted-foreground">{texts.subtitle}</p>
      </div>

      {body}
    </section>
  );
};
