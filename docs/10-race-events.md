# 10. 레이스 이벤트 확장

## 배경

이벤트 피드는 워커(폴러)가 OpenF1에서 받아 Firestore에 퍼블리시한 것을 클라이언트가
`onSnapshot`으로 구독하는 구조다. 따라서 **OpenF1 요청량은 동시 접속자 수와 무관한 고정비**이고,
이미 받아오는 응답에서 더 많은 이벤트를 뽑아내는 것은 추가 네트워크 비용이 0이다.

현재 `buildEvents`([OpenF1Recording.ts](../packages/domain/src/openf1/OpenF1Recording.ts))가
발행하는 이벤트는 10종뿐이고, `RaceEventType`에 정의만 되어 있고 한 번도 발행되지 않는 타입이 8종 있다.

## 문제

### 1. `race_control` 파싱이 문자열 키워드 매칭이다

현재 구현은 `message`를 대문자로 바꾼 뒤 `includes()`로 훑는다. 그러나 OpenF1 응답은
이미 구조화되어 있다. 실제 세션(session_key=11334, 151행) 기준 필드 분포:

| 필드 | 값 분포 |
|---|---|
| `category` | `Flag` 108, `Other` 35, `SafetyCar` 6, `SessionStatus` 2 |
| `flag` | `null` 43, `CLEAR` 42, `DOUBLE YELLOW` 30, `BLUE` 21, `YELLOW` 12, `GREEN` 2, `CHEQUERED` 1 |
| `scope` | `Sector` 81, `null` 43, `Driver` 21, `Track` 6 |

`driver_number`, `sector`, `lap_number`도 함께 온다.

### 2. 응답 필드를 타입에서 버리고 있다

[OpenF1Types.ts](../packages/domain/src/openf1/OpenF1Types.ts)의 `OpenF1RaceControl`에
`driver_number` / `sector` / `lap_number`가 없다. 그래서 "누구에 대한 메시지인지"를 알 수 없다.
블루 플래그 21건은 전부 `scope: "Driver"` + `driver_number`를 갖고 있는데 이를 통째로 버린다.

### 3. 이미 받은 데이터로 만들 수 있는 이벤트를 안 만든다

`laps`, `intervals`, `stints`, `team_radio`는 모두 폴링하지만 이벤트로는 쓰지 않는다.

### 4. 노이즈 제어 장치가 없다

섹터 옐로/클리어만 81건이다. 전부 피드에 넣으면 읽을 수 없게 된다.

## 설계

### 원칙: 구조화 우선, 문자열은 최후

`category` → `flag` → `scope` 순으로 분기하고, `message` 문자열 파싱은
구조화 필드로 판별 불가능한 것(페널티·조사·리커버리 차량)에만 쓴다.

### 원칙: 피드와 AI 컨텍스트를 분리한다

모든 이벤트를 발행하되, **우선순위로 소비처를 나눈다.**

| 소비처 | 포함 |
|---|---|
| 이벤트 피드(기본) | `Critical` + `High` |
| 이벤트 피드(전체 보기) | 전부 |
| AI 컨텍스트 | 전부 |

`Low`는 저장은 하되 기본 피드에 노출하지 않는다. 섹터 옐로처럼 개별로는 무의미하지만
AI가 "왜 페이스가 떨어졌나"를 설명할 때는 필요한 정보가 여기 해당한다.

### 원칙: 상태 전이만 이벤트로 만든다

`DOUBLE YELLOW IN TRACK SECTOR 7` → `CLEAR IN TRACK SECTOR 7`처럼 같은 섹터에서
반복되는 쌍은 **열림(전이)만** 이벤트로 만들고 닫힘은 기존 이벤트를 종료시킨다.
동일 상태가 연속으로 들어오면 중복 발행하지 않는다(`deduplicationKey`로 흡수).

이 dedup 은 **시간 순서에 전적으로 의존**한다. 응답 하나가 어긋난 순서로 오면 옐로/클리어
쌍이 조용히 뒤집히므로, `race_control` 도 `laps`/`intervals` 와 동일하게 시각 기준으로
정렬한 뒤 소비한다.

버킷을 잘못 합치면 dedup 이 과잉 억제로 바뀐다.

- `sector` 가 `null` 이면 어느 섹터인지 알 수 없다. 한 버킷으로 합치면 서로 다른 섹터의
  옐로가 서로를 억제하므로 dedup 대상에서 제외한다.
- `TrackHazard` 는 코너 번호만으로 상태를 잡으면 같은 코너에서 한참 뒤 재발생한 리커버리
  차량이 영구히 억제된다. 랩 번호를 상태값에 섞고, 트랙 전체 클리어(`GREEN` /
  `CLEAR`+`Track`) 수신 시 위험물 상태를 리셋한다.

## 신규 이벤트 타입

기존 `RaceEventType`에서 **미사용 타입을 먼저 재활용**하고, 부족한 것만 추가한다.

### 재활용 (이미 enum에 있음)

| 타입 | 소스 | 우선순위 |
|---|---|---|
| `GreenFlag` | `flag: GREEN` | High |
| `Retirement` | `session_result.dnf` / `dns` / `dsq` | High |
| `PersonalBestLap` | `laps` 드라이버별 자기 최속 갱신 | Low |
| `GapClosing` | `intervals` < 1.0s 진입 (DRS 비활성 구간) | Medium |
| `DrsRangeEntered` | `intervals` < 1.0s 진입 (DRS 활성 구간) | Medium |
| `StrategyNote` | `stints` 컴파운드 전략 갈림 | Medium |

`PositionChange`, `GapIncreasing`는 이번 범위에서 제외한다 —
`Overtake` 이벤트와 의미가 겹쳐 피드가 중복된다.

#### `GapClosing` 과 `DrsRangeEntered` 는 상호 배타로 발행한다

둘 다 "간격 1.0초 미만 진입"이라는 같은 순간을 가리키므로 동시에 발행하면 피드에 같은
사건이 두 번 뜬다. 따라서 진입 시점이 DRS 활성 구간이면 `DrsRangeEntered`,
아니면 `GapClosing` 으로 **하나만** 발행한다.

DRS 활성 판정은 다음 순서로 한다.

1. 세션에 `OVERTAKE ENABLED` / `OVERTAKE DISABLED` race_control 문구가 있으면 그 구간을 따른다
   (OpenF1 이 DRS 를 이 문구로 통보한다 — 가장 정확한 근거다).
2. 없으면 "랩 3 이후" 휴리스틱으로 대체한다.
3. 어느 경우든 SC/VSC 전개 중이거나 적기 구간이면 비활성으로 본다.

params: `driverCode`, `gapSeconds`, `aheadDriverCode`(앞차 특정 시에만).
`DrsRangeEntered` 는 추격 대상 표기를 위해 `targetDriverCode` / `targetDriverNumber` 도 담는다.

앞차는 `intervals.interval` 이 "바로 앞차와의 간격"이라는 점을 이용해
같은 시각의 `positions` 에서 `position - 1` 인 드라이버로 특정한다. 특정할 수 없으면
해당 키를 담지 않는다(빈 문자열을 UI 에 노출하지 않는다).

#### `StrategyNote` 판정 기준

피트 후 새 스틴트를 시작한 시점(`lap_start > 1`)에, 같은 랩 기준으로 나머지 드라이버가
쓰고 있던 컴파운드 분포를 세어 **과반 컴파운드와 다른 것을 골랐을 때만** 발행한다.
표본이 3명 미만이거나 과반이 없으면 "필드 다수"라고 말할 수 없으므로 발행하지 않는다.
출발 스틴트(`lap_start <= 1`)는 그리드 선택이라 "갈림"으로 보지 않는다.

params: `driverCode`, `compound`, `fieldCompound`.

### 추가

| 타입 | 값 | 소스 | 우선순위 | params |
|---|---|---|---|---|
| `Penalty` | `penalty` | `Other` + 페널티 문구 | Critical | `driverCode`, `penaltySeconds`, `reason` |
| `Investigation` | `investigation` | `Other` + `NOTED` / `INVESTIGAT` | High | `driverCodes`, `reason`, `status` |
| `TrackLimits` | `track_limits` | `Other` + `TRACK LIMITS` | Low | `driverCode`, `turn` |
| `BlueFlag` | `blue_flag` | `flag: BLUE`, `scope: Driver` | Low | `driverCode` |
| `SectorYellow` | `sector_yellow` | `flag: YELLOW`/`DOUBLE YELLOW`, `scope: Sector` | Medium | `sector`, `double` |
| `SectorClear` | `sector_clear` | `flag: CLEAR`, `scope: Sector` | Low | `sector` |
| `ChequeredFlag` | `chequered_flag` | `flag: CHEQUERED` | High | — |
| `DrsEnabled` | `drs_enabled` | `OVERTAKE ENABLED` | Medium | — |
| `DrsDisabled` | `drs_disabled` | `OVERTAKE DISABLED` | Medium | — |
| `TrackHazard` | `track_hazard` | `RECOVERY VEHICLE` / `MARSHALS ON TRACK` | High | `turn`, `kind` |
| `PitLaneClosed` | `pit_lane_closed` | `PIT EXIT CLOSED` | Medium | — |
| `PitLaneOpen` | `pit_lane_open` | `PIT EXIT OPEN` | Medium | — |
| `RainRisk` | `rain_risk` | `RISK OF RAIN ... IS N%` | Medium | `percent` |
| `TeamRadioPosted` | `team_radio_posted` | `team_radio` | Low | `driverCode`, `recordingUrl` |

> OpenF1은 DRS를 `OVERTAKE ENABLED/DISABLED` 문구로 표기한다. 무선 용어가 아니라
> DRS 활성화를 뜻하므로 UI 번역에서는 "DRS"로 표기한다.

### 메시지 파싱 규칙 (구조화 불가 항목만)

실제 관측된 문구:

```
INCIDENT INVOLVING CAR 23 (ALB) NOTED - CAR SAFETY LIGHTS (14:22:09)
FIA STEWARDS: INCIDENT INVOLVING CAR 23 (ALB) WILL BE INVESTIGATED AFTER THE RACE - ...
TURN 6 INCIDENT INVOLVING CARS 44 (HAM) AND 63 (RUS) NOTED - CAUSING A COLLISION (15:04:29)
RECOVERY VEHICLE ON TRACK AT TURN 6
RISK OF RAIN FOR THE F1 RACE IS 10%
```

- 차량 추출: `/CARS?\s+(\d+)\s*\((\w+)\)/g` — 복수 매치를 모두 수집한다(다중 차량 인시던트).
  두 번째 이후 차량(`CARS 44 (HAM) AND 63 (RUS)`)은 `CAR` 접두사가 없지만,
  `숫자 (대문자코드)` 를 무조건 차량으로 보면 `LAP 12 (SC)` 같은 구간이 유령 차량이 된다.
  따라서 복수형 `CARS` 절 안에서 구분자(`AND` / `,`)에 앵커링해 수집한다.
- 사유 추출: 말미 시각 괄호를 떼고 ` - ` 로 나눈 뒤 **뒤에서부터** 훑어 알려진 사유에
  처음 걸리는 구간을 채택한다. 하이픈이 여러 개인 스튜어드 문구
  (`... FOR CAR 1 (VER) - CAUSING A COLLISION - TURN 4 (15:10:00)`)에서
  최좌측·최우측 어느 한쪽만 보면 모두 매치에 실패한다.
- 턴 번호: `/TURN\s+(\d+)/`.
- 페널티 초: `/(\d+)\s+SECOND(?:S)?\s+(?:TIME\s+)?PENALTY/`.
- 조사 상태: `NOTED` 는 스튜어드의 **접수**이지 종결이 아니다. boolean 으로는 접수와
  종결을 구분할 수 없으므로 `InvestigationStatus` 3-상태(`noted` / `under_investigation` /
  `concluded`)로 담는다. 종결 신호는 `NO FURTHER ACTION` / `NO FURTHER INVESTIGATION` /
  `INVESTIGATION COMPLETE` 계열이며, 판정 우선순위는 종결 > 조사 중 > 접수다.
- 매치 실패 시 이벤트를 발행하지 않는다. **원문 문자열을 params에 담아 UI에 그대로 노출하지 않는다**
  (i18n 원칙 위반이며 영문이 그대로 노출된다).

## `session_result` 통합

세션당 1회 폴링. 확인된 응답(22행):

```json
{ "position": 1, "driver_number": 12, "number_of_laps": 44, "points": 25.0,
  "dnf": false, "dns": false, "dsq": false, "duration": 5082.479, "gap_to_leader": 0 }
```

용도:

1. **리타이어 확정** — 현재 `retired`는 포지션 데이터 소실로 추정한다. `dnf`/`dns`/`dsq`로 대체한다.
2. **`Retirement` 이벤트 발행** — 사유를 `dnf` / `dns` / `dsq`로 구분한다.
3. 최종 순위·포인트는 이번 범위 밖(세션 종료 후에만 유효).

> `starting_grid`, `pit_lane_times`는 현재 세션과 과거 세션 모두 `No results found`로
> 응답한다. 접근 불가로 판단하고 범위에서 제외한다.

## 범위 밖

- `car_data`(DRS/RPM/기어), `location`(미니맵) — 3.7Hz 폴링이 필요하다.
  OpenF1 rate limit보다 **Firestore 쓰기 볼륨**이 병목이다(초당 수십 회 문서 갱신).
  별도 컬렉션 + 다운샘플링 설계가 선행되어야 한다.
- 최종 순위/포인트 표시.

## 수용 기준

1. `OpenF1RaceControl` 타입이 `driver_number`, `sector`, `lap_number`를 보존한다.
2. `buildEvents`가 `category`/`flag`/`scope` 구조화 필드로 분기한다.
3. 신규 14종 + 재활용 6종 이벤트가 발행된다.
4. 동일 상태 반복 시 중복 이벤트가 발행되지 않는다.
5. 기본 피드에 `Low` 이벤트가 노출되지 않는다.
6. 모든 신규 타입이 en/ko/ja 3개 로케일로 번역된다 — 원문 영어 문자열이 UI에 노출되지 않는다.
7. 파싱 실패 시 이벤트를 발행하지 않으며 예외를 던지지 않는다.
