// 주말 타이어 할당·반납 규정과 "남은 타이어 경우의 수" 계산 (docs/28 이후 사용자 결정).
//
// **왜 경우의 수인가**: 규정은 세션별로 "몇 세트를 반납하라"만 정하고, **어떤 컴파운드를
// 반납할지는 팀 선택**이다. 그래서 반납 뒤 남은 구성은 하나로 확정되지 않고 여러 가능성이
// 된다. OpenF1 에는 타이어 세트 ID·할당 데이터가 없어(스틴트엔 compound·시작 나이뿐) 정확한
// 잔여를 알 수 없으므로, 규정만으로 계산 가능한 **가능한 구성 전체**를 보여 준다.
//
// LLM 을 쓰지 않는다 — 전부 산수다.

import { TireCompound } from "../TireCompound";

// 주말 형식. 스프린트 주말은 할당·반납 규정이 다르다.
export enum WeekendFormat {
  Conventional = "conventional",
  Sprint = "sprint",
}

// 드라이 슬릭 3종의 세트 수. 인터·웨트는 할당 규정이 별개라 이 모델의 대상이 아니다.
export type TireSetCounts = {
  hard: number;
  medium: number;
  soft: number;
};

// 주말별 드라이 슬릭 할당 (사용자 제공 규정).
//   일반: 하드 2 · 미디엄 3 · 소프트 8 (13세트)
//   스프린트: 하드 2 · 미디엄 4 · 소프트 6 (12세트)
export const DRY_TIRE_ALLOCATION: Record<WeekendFormat, TireSetCounts> = {
  [WeekendFormat.Conventional]: { hard: 2, medium: 3, soft: 8 },
  [WeekendFormat.Sprint]: { hard: 2, medium: 4, soft: 6 },
};

// 반납 단계. count 만 규정이 정하고 컴파운드는 팀 선택이다(그래서 잔여가 경우의 수가 된다).
// after 는 "이 세션 종료 후 반납"을 뜻하는 세션 종류 키다.
export type TireReturnStage = {
  after: string;
  count: number;
};

// 주말별 반납 일정 (사용자 제공 규정).
//   일반: FP1 후 2 · FP2 후 2 · FP3 후 2 (총 6 반납 → 7세트 잔여)
//   스프린트: FP1 후 1 · 스프린트 후 1 · 퀄리 후 3 (총 5 반납 → 7세트 잔여)
export const TIRE_RETURN_SCHEDULE: Record<WeekendFormat, TireReturnStage[]> = {
  [WeekendFormat.Conventional]: [
    { after: "fp1", count: 2 },
    { after: "fp2", count: 2 },
    { after: "fp3", count: 2 },
  ],
  [WeekendFormat.Sprint]: [
    { after: "fp1", count: 1 },
    { after: "sprint", count: 1 },
    { after: "qualifying", count: 3 },
  ],
};

export const totalTireSets = (counts: TireSetCounts): number =>
  counts.hard + counts.medium + counts.soft;

// 앞에서부터 completedStages 개 반납 단계가 끝났을 때 지금까지 반납한 세트 수.
// completedStages 를 음수/초과로 줘도 [0, 전체 단계]로 잘라 안전하게 다룬다.
export const returnedSetsThrough = (
  format: WeekendFormat,
  completedStages: number,
): number => {
  const stages = TIRE_RETURN_SCHEDULE[format];
  const clamped = Math.max(0, Math.min(completedStages, stages.length));

  let total = 0;

  for (let index = 0; index < clamped; index += 1) {
    total += stages[index]?.count ?? 0;
  }

  return total;
};

// 모든 반납이 끝난 뒤(= 레이스 시점) 반납한 총 세트 수.
export const totalReturnedSets = (format: WeekendFormat): number =>
  returnedSetsThrough(format, TIRE_RETURN_SCHEDULE[format].length);

// 반납 후 보유한 총 세트 수 (구성과 무관하게 정확히 하나로 정해진다).
export const remainingSetCount = (
  format: WeekendFormat,
  returnedCount: number,
): number => {
  const allocationTotal = totalTireSets(DRY_TIRE_ALLOCATION[format]);

  return Math.max(0, allocationTotal - returnedCount);
};

// 남은 구성의 **모든 경우의 수**. 합 = 잔여 세트 수, 각 컴파운드는 [0, 할당량] 범위다.
// 반납 컴파운드가 팀 선택이라 이 목록의 어느 하나가 실제 보유분이다(우리는 어느 것인지 모른다).
// 결정론적 순서(하드 내림차순 → 미디엄 내림차순)로 돌려준다.
export const remainingTirePossibilities = (
  format: WeekendFormat,
  returnedCount: number,
): TireSetCounts[] => {
  const allocation = DRY_TIRE_ALLOCATION[format];
  const remaining = remainingSetCount(format, returnedCount);
  const possibilities: TireSetCounts[] = [];

  for (let hard = allocation.hard; hard >= 0; hard -= 1) {
    for (let medium = allocation.medium; medium >= 0; medium -= 1) {
      const soft = remaining - hard - medium;

      if (soft >= 0 && soft <= allocation.soft) {
        possibilities.push({ hard, medium, soft });
      }
    }
  }

  return possibilities;
};

// 경우의 수를 컴파운드별 범위(min–max)로 압축한다. 목록이 길 때 요약 표시용.
export type TireCompoundRange = { min: number; max: number };
export type RemainingTireRanges = Record<"hard" | "medium" | "soft", TireCompoundRange>;

export const summarizeRemainingRanges = (
  possibilities: TireSetCounts[],
): RemainingTireRanges => {
  const fold = (pick: (counts: TireSetCounts) => number): TireCompoundRange => {
    if (possibilities.length === 0) {
      return { min: 0, max: 0 };
    }

    const values = possibilities.map(pick);

    return { min: Math.min(...values), max: Math.max(...values) };
  };

  return {
    hard: fold((counts) => counts.hard),
    medium: fold((counts) => counts.medium),
    soft: fold((counts) => counts.soft),
  };
};

// TireSetCounts 의 컴파운드 키를 도메인 TireCompound 로 매핑(화면에서 색·라벨 재사용).
export const TIRE_SET_COMPOUNDS: { key: keyof TireSetCounts; compound: TireCompound }[] = [
  { key: "soft", compound: TireCompound.Soft },
  { key: "medium", compound: TireCompound.Medium },
  { key: "hard", compound: TireCompound.Hard },
];
