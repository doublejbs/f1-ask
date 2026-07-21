"use client";

import { teamColorHex } from "@/lib/Format";
import { LiveRaceSnapshot, SessionStatus } from "@f1/domain";
import { type CSSProperties } from "react";

type Props = {
  snapshot: LiveRaceSnapshot;
};

// 워시 알파. 팀 컬러는 채도가 높아 낮게, 중립색은 거의 무채색이라 높게 잡는다.
const TEAM_WASH_ALPHA = 0.26;

// 세션 경보색. 상태가 팀 컬러를 이긴다(docs/12 §1).
const RED_FLAG_WASH = "rgba(214, 38, 38, 0.28)";
const CAUTION_WASH = "rgba(224, 179, 24, 0.22)";

// 팀 컬러도 경보도 없을 때 쓰는 아주 어두운 청회색.
const NEUTRAL_WASH = "rgba(38, 48, 62, 0.36)";

// "#RRGGBB" → "rgba(r, g, b, a)". 파싱 불가하면 null.
const toRgba = (hex: string, alpha: number): string | null => {
  const value = hex.replace("#", "");

  if (value.length !== 6) {
    return null;
  }

  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  if (Number.isNaN(red) || Number.isNaN(green) || Number.isNaN(blue)) {
    return null;
  }

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

// 세션 상태가 경보 상태면 해당 경보색을, 아니면 null 을 돌려준다.
const resolveStatusWash = (status: SessionStatus): string | null => {
  if (status === SessionStatus.Red || status === SessionStatus.Suspended) {
    return RED_FLAG_WASH;
  }

  if (
    status === SessionStatus.SafetyCar ||
    status === SessionStatus.VirtualSafetyCar ||
    status === SessionStatus.Yellow
  ) {
    return CAUTION_WASH;
  }

  return null;
};

// 워시 색 결정: 세션 경보 > 선두 드라이버 팀 컬러 > 중립.
const resolveAmbientColor = (snapshot: LiveRaceSnapshot): string => {
  const statusWash = resolveStatusWash(snapshot.status);

  if (statusWash !== null) {
    return statusWash;
  }

  const leader = snapshot.drivers.find((driver) => driver.position === 1);
  const hex = teamColorHex(leader?.teamColour);

  if (hex === null) {
    return NEUTRAL_WASH;
  }

  return toRgba(hex, TEAM_WASH_ALPHA) ?? NEUTRAL_WASH;
};

// 화면 상단에 깔리는 컨텍스트 앰비언트 워시. 스크롤과 무관하게 고정된다.
export const AmbientWashView = ({ snapshot }: Props) => {
  const ambientColor = resolveAmbientColor(snapshot);

  return (
    <div
      aria-hidden="true"
      className="ambient-wash"
      style={{ "--ambient-color": ambientColor } as CSSProperties}
    />
  );
};
