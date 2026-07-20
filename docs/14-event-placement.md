# 14. 이벤트를 맥락 있는 자리로 배치하기

## 배경

배틀은 순위 행 인라인으로, 팀 라디오는 행 인디케이터로 옮겼다. 같은 원칙을
나머지 이벤트에도 적용한다 — **이벤트는 그것이 설명하는 대상 옆에 있어야 한다.**

지금은 32종이 전부 하나의 시간순 피드로 흐른다. "HAM 5초 페널티"를 보고 HAM 이
몇 위인지 확인하려면 눈을 피드에서 순위로 옮겨야 하고, "세이프티카 전개"는
전체 경기 상황인데 추월 이벤트들 사이에 묻힌다.

## 두 축으로 나눈다

### 축 1 — 범위: 세션 / 드라이버

| 세션 (전체 경기) | 드라이버 (특정 선수) |
|---|---|
| `SessionStarted` `SessionRestarted` `SessionFinished` | `Overtake` `PitStop` `FastestLap` `PersonalBestLap` |
| `GreenFlag` `YellowFlag` `RedFlag` `ChequeredFlag` | `Penalty` `Investigation` `TrackLimits` `BlueFlag` |
| `SafetyCar` `VirtualSafetyCar` | `Retirement` `StrategyNote` `TeamRadioPosted` |
| `SectorYellow` `SectorClear` `TrackHazard` | `GapClosing` `OverrideRangeEntered` `PositionChange` |
| `PitLaneClosed` `PitLaneOpen` `RainRisk` | `GapIncreasing` |
| `OvertakeModeEnabled` `OvertakeModeDisabled` | |

`RaceEventScope` string enum(`Session` / `Driver`)과 타입 → 범위 매핑을
도메인에 둔다. **모든 타입이 매핑되어야 한다** — `Record<RaceEventType, RaceEventScope>`
로 선언해 타입이 추가되면 tsc 가 누락을 잡게 한다.

### 축 2 — 지속성: 상태 / 순간

이게 더 중요하다. 세션 이벤트 대부분은 **수명이 있는 상태**다.

```
SafetyCar 전개 ────────────────► SessionRestarted 로 해제
PitLaneClosed ─────────────────► PitLaneOpen 으로 해제
SectorYellow(7) ───────────────► SectorClear(7) 로 해제
OvertakeModeDisabled ──────────► OvertakeModeEnabled 로 해제
```

"세이프티카가 30초 전에 전개됐다"를 시간순 목록에 넣는 것은 **틀린 표현**이다.
알아야 할 것은 "지금 세이프티카 상황인가"다. 상단에는 **최근 이벤트가 아니라
현재 활성 상태**를 표시한다.

드라이버 이벤트도 마찬가지로 갈린다.

| 지속(상태) | 순간 |
|---|---|
| `Penalty` — 소화 전까지 | `Overtake` `PitStop` `FastestLap` |
| `Investigation` — `concluded` 전까지 | `PersonalBestLap` `TrackLimits` `TeamRadioPosted` |
| `Retirement` — 영구 | `StrategyNote` `BlueFlag` |

## 배치

### 세션 상태 → 상단 스트립 (SessionStatusStripView)

상태바 바로 아래에 **활성 상태만** 칩으로 나열한다. 없으면 스트립 자체를 감춘다.

```
[SC 전개] [피트레인 폐쇄] [섹터 7 옐로] [강우 40%]
```

- 상태 열림/닫힘 쌍을 도메인에서 접어 **현재 활성 집합**을 만든다
  (`selectActiveSessionStates(events)` — 순수 함수, 테스트 필수)
- `SectorYellow`/`SectorClear` 는 섹터별로 독립 상태다(`sector` 파라미터로 키를 나눈다)
- 색은 심각도에 따른다: 적기 > SC/VSC > 옐로 > 정보성
- 기존 `CriticalBannerView` 는 **순간 경보**(페널티 등)용으로 남기고, 지속 상태는
  이 스트립이 담당한다. 역할이 겹치지 않게 한다

### 드라이버 지속 상태 → 순위 행 마커

행에 작은 칩으로 붙인다. 해제될 때까지 유지된다.

```
05 ▌HAM        [+5s]        +12.9  ›
     Ferrari · H·14랩
```

- `Penalty` → `+5s` / `+10s` (초 없으면 `PEN`)
- `Investigation` → `?` (`status` 가 `concluded` 면 제거)
- `Retirement` → 기존 `opacity-45` 유지, 별도 칩 없음

### 드라이버 순간 이벤트 → 행 일시 표시

발생 후 **짧은 시간만** 행에 드러났다가 사라진다. 행 높이는 바뀌지 않아야 한다
(레이아웃이 출렁이면 읽기가 불가능해진다).

- 아이콘 한 개 자리를 고정으로 확보하고 그 안에서 교체한다
  (`PitStop` → 렌치, `FastestLap` → 보라 스톱워치, `Overtake` → 화살표)
- 표시 시간은 **경기 시계 기준**으로 판정한다. 벽시계로 하면 리플레이에서
  항상 "오래된 이벤트"가 된다(팀 라디오에서 이미 겪은 문제다)
- `TeamRadioPosted` 는 **이미 라디오 인디케이터가 있으므로 제외**한다
- `GapClosing` / `OverrideRangeEntered` 는 **이미 배틀 인라인이 있으므로 제외**한다

## 피드 시트를 없앤다 — 분해한다

이벤트 바텀 시트(`EventSheetView`)를 제거한다. 피드를 삭제하는 것이 아니라
**각 조각을 맥락 있는 자리로 분해**한다. 시트가 순위를 덮고 있어야 할 이유가
사라지고, 순위가 화면을 되찾는다.

```
┌──────────────────────────┐
│ 상태바  LAP 35/44  ● 그린  │
├──────────────────────────┤
│ [SC 전개] [섹터 7 옐로]     │  ← 세션 활성 상태 (없으면 숨김)
├──────────────────────────┤
│ ● HAM 5초 페널티 (충돌 유발) │  ← 최신 이벤트 1건 + AI 해설
│   3랩 남아 방어가 어렵습니다  │     탭 → 해당 드라이버 상세 시트
├──────────────────────────┤
│ 01 ANT           선두   › │
│ 02 LEC  [+5s]   +1.6   › │  ← 지속 마커
│ 03 VER  ⛽      +8.3   › │  ← 순간 아이콘
│ ...                       │
└──────────────────────────┘
```

| 조각 | 행선지 |
|---|---|
| 세션 상태 | 상단 스트립 |
| 드라이버 이벤트 | 순위 행 마커·아이콘 |
| AI 해설 | 최신 이벤트 카드(1건) + 드라이버 상세 시트 |
| 시간순 이력 | 드라이버 상세 시트(해당 드라이버 것만) |
| 드라이버 필터 | **불필요해져 제거** — 행 마커가 그 역할을 대신한다 |

### 최신 이벤트 카드 (LatestEventCardView)

`Critical` + `High` 중 가장 최근 1건. 이벤트 문장 + (목이 아닌) AI 해설.
탭하면 관련 드라이버의 상세 시트를 연다(드라이버가 특정되는 이벤트만 탭 가능).

해설이 갈 곳이 여기와 상세 시트뿐이므로, **LLM 이 실제로 동작할 때 해설이
평소에 보이는 유일한 자리**다. 이벤트가 없으면 카드를 숨긴다.

### 드라이버 상세 시트에 이력 추가

기존 스탯 행 아래에 그 드라이버의 이벤트 이력(최신순, 상한 있음)을 붙인다.
각 항목은 이벤트 문장 + AI 해설 한 겹으로, 피드에서 쓰던 표현을 재사용한다.
`filterEventsByDriver` 셀렉터를 그대로 쓴다(C단계에서 만든 것).

### 제거 대상

- `EventSheetView`, `UseEventSheetSnap`, `EventSheetSnap`
- `EventFeedView`, `EventFeedListView`, `EventFeedFilterView`, `UseEventFeedState`
- 드라이버 필터 UI(`DriverFilterChipView`, `UseDriverEventFilter`) — 단
  `filterEventsByDriver` **도메인 셀렉터는 상세 시트가 쓰므로 유지**
- 관련 사전 키 중 참조 0건이 되는 것

데스크톱 3컬럼도 가운데 피드 컬럼이 사라지므로 `[순위 | AI]` 2컬럼이 된다.

## 행 밀도 — 가장 큰 리스크

순위 행에는 이미 별·순위·팀바·코드·팀명·타이어·갭·등락·시크론·라디오·배틀 액센트가
있다. 팀명 잘림이 **네 번** 재발한 이력이 이 밀도를 말해준다.

따라서:
1. 지속 마커와 순간 아이콘은 **같은 슬롯 하나**를 공유한다(동시에 둘 다 필요하면
   지속 마커가 이긴다 — 페널티가 추월보다 중요하다)
2. 슬롯은 **고정 폭**으로 잡아 있을 때와 없을 때 레이아웃이 동일해야 한다
3. 구현 후 375px 에서 팀명 잘림 0건을 반드시 실측한다

## 수용 기준

1. `RaceEventScope` 가 `Record<RaceEventType, ...>` 로 선언되어 타입 누락을 tsc 가 잡는다.
2. `selectActiveSessionStates` 가 열림/닫힘 쌍을 접어 현재 활성 상태만 반환한다.
   섹터 옐로는 섹터별로 독립적이다. 단위 테스트가 있다.
3. 활성 세션 상태가 없으면 상단 스트립이 렌더되지 않는다.
4. 페널티·조사 마커가 순위 행에 붙고, 해제 조건에서 사라진다.
5. 순간 이벤트 아이콘이 경기 시계 기준으로 표시·소멸하며 행 높이를 바꾸지 않는다.
6. 팀 라디오·배틀은 기존 인라인 표현을 쓰고 중복 표시하지 않는다.
7. 375px 에서 팀명 잘림 0건.
8. 신규 UI 텍스트 en/ko/ja. 마커는 색에만 의존하지 않는다(`title`/`aria-label`).
