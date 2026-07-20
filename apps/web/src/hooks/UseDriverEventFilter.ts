"use client";

import { LiveDriverState } from "@f1/domain";
import { useCallback, useState } from "react";

// 이벤트 피드를 좁히는 드라이버 필터 대상.
// 매칭에 번호와 코드가 모두 필요하고(도메인 셀렉터의 세 경로), 칩 액센트에 팀 컬러가 필요해
// LiveDriverState 전체가 아니라 이 세 값만 들고 있는다(스냅샷 갱신에 재렌더되지 않는다).
export type DriverEventFilterTarget = {
  driverNumber: number;
  code: string;
  teamColour: string | null;
};

export type DriverEventFilterState = {
  driverFilter: DriverEventFilterTarget | null;
  handleFilterByDriver: (driver: LiveDriverState) => void;
  handleClearDriverFilter: () => void;
};

// 드라이버 이벤트 필터 상태 (docs/13-race-console.md 원칙 3).
//
// 이 상태는 useEventFeedState 에 합치지 않고 별도 훅으로 둔다. useEventFeedState 는
// 모바일 시트(EventSheetView)와 데스크톱 피드(EventFeedView)에서 각각 인스턴스화되므로
// 거기에 합치면 필터가 두 벌로 갈라지고, 필터를 거는 주체인 드라이버 상세 시트에서는
// 어느 쪽에도 닿을 수 없다. 두 소비자의 공통 조상(LiveDashboardView)에서 한 번 만들어
// 아래로 내려준다.
export const useDriverEventFilter = (): DriverEventFilterState => {
  const [driverFilter, setDriverFilter] =
    useState<DriverEventFilterTarget | null>(null);

  const handleFilterByDriver = useCallback((driver: LiveDriverState) => {
    setDriverFilter({
      driverNumber: driver.driverNumber,
      code: driver.code,
      teamColour: driver.teamColour ?? null,
    });
  }, []);

  const handleClearDriverFilter = useCallback(() => {
    setDriverFilter(null);
  }, []);

  return { driverFilter, handleFilterByDriver, handleClearDriverFilter };
};
