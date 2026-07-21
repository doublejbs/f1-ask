"use client";

import { WatchNowLaneRowView } from "@/components/WatchNowLaneRowView";
import { Dictionary } from "@/i18n/Messages";
import { LiveDriverState, WatchNowLaneGroup, WatchNowLanes } from "@f1/domain";
import { useMemo } from "react";

type Props = {
  dictionary: Dictionary;
  // 레이스 중이 아니면 훅이 null 을 준다. 그때는 섹션 자체가 없다.
  lanes: WatchNowLanes | null;
  drivers: LiveDriverState[];
  onSelectDriver: (driver: LiveDriverState) => void;
};

// "지금 볼 것" — 역할이 고정된 칸 3개 (docs/19-watch-now.md §화면).
//
// **칸은 경쟁하지 않는다.** 선두권(P1~P3) · 필드(P4 이하) · 내 드라이버는 각자 자기
// 범위만 담당하며, 칸 사이 점수 비교는 도메인에도 UI 에도 없다. 칸 안 순서만 걸린
// 챔피언십 포인트와 발생 시각으로 정해진다.
//
// **레이아웃을 항상 같은 모양으로 유지한다.** 이 화면은 방송을 보다가 눈을 돌려 확인하는
// 세컨드 스크린이므로, 90초마다 섹션이 나타났다 사라지며 아래 순위표를 밀어 올리면
// 보고 있던 행이 손가락 아래에서 움직인다. 그래서 후보가 없는 칸도 사라지지 않고
// "지금은 조용함" 한 줄로 줄어든다 — 높이만 줄고 구조는 그대로다.
//
// 즐겨찾기가 없으면 세 번째 칸은 조용함조차 표시하지 않고 통째로 접힌다(docs/19 수용
// 기준 2). "내 드라이버가 없다"와 "내 드라이버가 지금 조용하다"는 다른 말이기 때문이다.
export const WatchNowLanesView = ({
  dictionary,
  lanes,
  drivers,
  onSelectDriver,
}: Props) => {
  const texts = dictionary.watchNow;

  // 신호는 드라이버 번호만 들고 있다. 행 탭으로 상세 시트를 열려면 로스터가 필요하다.
  const driverByNumber = useMemo(() => {
    const map = new Map<number, LiveDriverState>();

    for (const driver of drivers) {
      map.set(driver.driverNumber, driver);
    }

    return map;
  }, [drivers]);

  if (lanes === null) {
    return null;
  }

  const visibleLanes = lanes.lanes.filter((group) => !group.collapsed);

  // 접히지 않은 칸이 하나도 없는 경우는 구조상 없지만(선두권 · 필드는 접히지 않는다),
  // 설정이 바뀌어 그렇게 되면 빈 껍데기를 그리지 않는다.
  if (visibleLanes.length === 0) {
    return null;
  }

  const renderLane = (group: WatchNowLaneGroup) => (
    <div key={group.lane} className="flex flex-col">
      <div className="flex items-baseline gap-2 px-3 pt-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {texts.lane[group.lane]}
        </h3>
      </div>

      {group.entries.length === 0 ? (
        // 탭 대상이 아니므로 44pt 를 쓰지 않는다. 조용한 칸이 화면을 먹지 않게 하는 것이
        // 이 줄의 목적이다 — 실측상 세 칸이 모두 비는 시간이 전체의 17.5% 다.
        <p className="px-3 pb-1.5 pt-0.5 text-[12px] leading-snug text-muted-foreground/70">
          {texts.quiet}
        </p>
      ) : (
        <div className="flex flex-col pb-0.5">
          {group.entries.map((entry) => (
            <WatchNowLaneRowView
              key={`${entry.signal.driverNumber}:${entry.signal.type}`}
              dictionary={dictionary}
              entry={entry}
              driver={driverByNumber.get(entry.signal.driverNumber) ?? null}
              onSelectDriver={onSelectDriver}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    // role="group" — 6초마다 내용이 바뀌므로 라이브 리전으로 두면 스크린리더가 갱신마다
    // 전체를 다시 읽어 소음이 된다(LatestEventPagerView 와 같은 판단).
    <section
      role="group"
      aria-label={texts.title}
      className="glass-float animate-fade-up overflow-hidden rounded-2xl"
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-white/[0.08] px-3 py-2">
        <h2 className="text-[12px] font-semibold text-foreground">
          {texts.title}
        </h2>

        <p className="truncate text-[11px] text-muted-foreground/80">
          {texts.subtitle}
        </p>
      </div>

      <div className="divide-y divide-white/[0.06]">
        {visibleLanes.map(renderLane)}
      </div>
    </section>
  );
};
