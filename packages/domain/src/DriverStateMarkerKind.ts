// 순위 행에 붙는 드라이버 지속 마커 종류 (docs/14-event-placement.md "드라이버 지속 상태").
// Retirement 는 기존 `retired` 플래그와 opacity 처리로 충분하므로 마커를 만들지 않는다.
export enum DriverStateMarkerKind {
  // 페널티 — `+5s` / `+10s` (초를 모르면 `PEN`).
  Penalty = "penalty",
  // 조사 — `?` (status 가 concluded 면 제거).
  Investigation = "investigation",
}
