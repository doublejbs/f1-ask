# 27. 주말 컨텍스트 — 프랙티스·퀄리파잉을 AI와 화면에 싣는다

## 배경

사용자가 "어제 퀄리파잉 끝났는데 휠켄버그 Q1 몇 위였어?" 라고 물었더니 **"데이터가 없다"** 고
답했다. AI 는 정직했다 — 정말 없었다. 원인이 세 겹이다(실측):

| 층 | 상태 |
|---|---|
| OpenF1 에 데이터 | ✅ **있다** — Q1/Q2/Q3 랩타임·갭을 배열로 준다 |
| 우리가 가져오는가 | ❌ 아카이브가 `session_type === "Race"` 만 조회 (`ArchiveSessionSelector.ts:67`) |
| 타입이 감당하는가 | ❌ `OpenF1SessionResult.duration: number \| null` 인데 **퀄리는 배열**이다 |

정답은 실재한다 — 2026 헝가리 퀄리(session 11338) #27 HUL: `duration [78.796, 78.639,
78.686]`, **Q1 6위**, 최종 P10. 이 한 행이 이 스펙의 핵심을 보여준다: **`position`(10)과
세그먼트 랭크(6)는 다른 값이고, 후자는 우리가 계산해야 한다.**

## 실측 (2026 시즌 전수 조사 — 가정 아님)

### 주말 구성은 두 종류다

```
일반 주말 (meeting 1279 멜버른)        스프린트 주말 (meeting 1289 영국) — 완료 10R 중 4R
  Practice   | Practice 1                Practice   | Practice 1
  Practice   | Practice 2                Qualifying | Sprint Qualifying
  Practice   | Practice 3                Race       | Sprint
  Qualifying | Qualifying                Qualifying | Qualifying
  Race       | Race                      Race       | Race
```

**`session_type` 당 세션이 하나라는 전제는 틀렸다.** 스프린트 주말은 Qualifying 2개·Race
2개이고 FP2/FP3 가 없다. Sprint Qualifying 도 3세그먼트 배열이라(11317 P1 `[89.273,
88.747, 88.376]`) Q1/Q2/Q3 라벨을 박으면 SQ 를 Q 로 오표기한다.

### 같은 필드가 세션마다 형태도 의미도 다르다

```jsonc
// Practice — 스칼라, 의미는 베스트 랩
{"position":1, "driver_number":81, "duration":89.26, "gap_to_leader":0}
// Race — 스칼라, 의미는 총 주행 시간(!). 랩다운은 문자열 갭
{"position":1, "duration":5231.335}   /  {"position":17, "duration":null, "gap_to_leader":"+1 LAP"}
// Qualifying — 3세그먼트 배열, 세그먼트별 리더 대비 갭
{"position":1, "duration":[79.507, 78.934, 78.518], "gap_to_leader":[0.0, 0.0, 0.0]}
```

프랙티스 `89.26`(베스트랩)과 레이스 `5231.335`(총 시간)를 한 필드로 받으면 "베스트랩
5231초"가 된다. **세션 종류별로 의미가 다른 값이다.**

### 퀄리 세그먼트 패턴은 "접두 연속"이 아니다

15개 퀄리 세션 전수 스캔 결과:

- **Q3 진출·무기록이 3세션(20%)에 실재** — 11303 #16 `[75.964, 75.281, null]` dnf:true,
  11330 #6 `[106.062, 105.823, null]` dnf:true, 11230 #5 `[80.495, 80.221, null]`.
  "마지막 non-null = 탈락 지점" 규칙은 **이들을 전부 Q2 탈락으로 오판**한다
- **구멍 패턴** — 11276 #6 `[null, 88.941, 88.789]` (Q1 무기록인데 Q2·Q3 기록)
- **`position: null` 행 실재** — 11276 #6, 11271 #14
- **컷 인원이 고정이 아니다** — 세그먼트 non-null 수가 `[22,16,10]`·`[20,15,10]`·
  `[19,16,9]` 로 흔들린다. 15/10 하드코딩 금지
- **행 수 < 엔트리 수** — 멜버른 퀄리 19행(레이스는 22행). 결측 드라이버가 실제 케이스
- **`points` 키가 프랙티스·퀄리 응답엔 아예 없다** (타입은 required 로 선언 — 거짓)
- **취소 세션은 `session_result` 404** (11257 바레인·11265 제다)

## 설계

### 저장하지 않는다 — 아카이브와 같은 온디맨드

아카이브는 Firestore 없이 OpenF1 을 조회한다(`ArchiveLoader`). 주말 컨텍스트도 같다 —
**새 저장소·워커 변경 없음.** 캐시도 이미 있다(`unstable_cache`). 단 응답 형태가 바뀌므로
**`ARCHIVE_CACHE_VERSION` 을 올린다**(안 올리면 1년 캐시가 옛 형태를 붙잡는다).

### 세션 지목: 고정 enum 이 아니라 미팅의 실제 목록에서 도출

`"fp1"|"fp2"|"fp3"|"qualifying"|"race"` 같은 고정 열거는 스프린트 주말에서 무너진다.

- 주말 조회는 **`sessions?meeting_key=` 로 실제 세션 목록**을 받아 그대로 쓴다
- 세션 지목은 `session_key`(정확) 또는 `session_name`("Practice 1"·"Sprint Qualifying")
- **`toSessionId` 는 FP1/2/3 를 구분하지 못한다** — `session_type` 기반이라 셋 다
  `2026-hun-practice` 로 충돌하고, 스프린트 주말은 `2026-gbr-race` 가 2행에 중복된다
  (`OpenF1Client.ts:229`). **`session_name` 을 포함하도록 고친다** — 기존 라이브 경로는
  고정 슬러그 `openf1-live` 라 영향 없음
- 세그먼트 라벨은 세션명에서 파생: Qualifying → Q1/Q2/Q3, Sprint Qualifying → SQ1/SQ2/SQ3

### 결과 타입: 세션 종류별로 분리한다

```ts
// 프랙티스 — duration 은 베스트 랩
type PracticeResult = { driverNumber; driverCode; position | null; bestLapSeconds | null;
                        gapToLeaderSeconds | null; lapCount; dnf; dns; dsq };
// 레이스 — duration 은 총 시간, 랩다운은 문자열 라벨 보존
type RaceFinishResult = { …; totalTimeSeconds | null; gapToLeaderSeconds | null; gapLabel | null; points | null };
// 퀄리(스프린트 퀄리 포함) — 세그먼트
type QualifyingSegment = { index: 1|2|3; label: string /* Q1 · SQ1 */;
                           lapSeconds | null; gapToLeaderSeconds | null; rank | null };
type QualifyingResult = { driverNumber; driverCode; finalPosition | null;
                          segments: QualifyingSegment[]; reachedSegment: 1|2|3; dnf; dsq };
```

규칙:

- **`rank` 는 우리가 계산한다** — 각 세그먼트에서 `lapSeconds` non-null 인 드라이버끼리
  오름차순. 이게 "Q1 몇 위"의 답이다. `position`(최종 분류)과 절대 혼동하지 않는다.
  실측 증거: 11230 #41 은 P9 인데 Q3 기록이 P10(무기록)보다 느리다 — 최종 순위는
  세그먼트 성적이 아니다
- **`eliminatedIn` 을 쓰지 않는다.** `[t, t, null]` 은 "Q2 탈락"과 "Q3 진출·무기록"을
  **구분할 수 없다**(실측 3세션). 대신 **`reachedSegment`**(진출 단계)를 **세그먼트별
  참가자 수와 finalPosition 밴드**로 판정하고, 기록 유무는 `lapSeconds: null` 로 분리해
  표현한다. 컷 인원 하드코딩 금지(실측상 가변)
- **정렬·동률**: rank 는 lapSeconds 오름차순, 동률이면 driverNumber 오름차순(FIA 는 먼저
  기록한 쪽 우선이나 우리에겐 시각이 없다 — 결정론을 위해 이 규칙을 못박고 주석에 한계 명시).
  `position: null` 은 기존 `comparePosition` 처럼 뒤로 보낸다
- **소스는 `session_result` 고정**. `laps` 로 베스트랩을 재계산하면 **삭제된 랩이 섞인다**
- **`gap_to_leader[i]` 는 세그먼트 i 의 리더 대비**다(검산 확인). "최종 리더 대비"가 아니다
- **형태 분기 우선, null 일 때만 session_type 폴백** — `duration: null` 은 형태 정보를
  담지 않는다(레이스 랩다운 행이 실제 null)
- **드라이버 코드 조인 필수** — 번호만으로는 "휠켄버그"를 못 찾는다. `drivers?meeting_key=`
  **1요청**이면 주말 전 세션 로스터가 온다(실측 110행). 세션별 로스터가 다를 수 있어
  (FP1 루키·시즌 중 교체) 스냅샷 로스터로 대신하지 않는다
- `OpenF1SessionResult.points` 를 **optional 로 정정**(프랙티스·퀄리 응답엔 키가 없다)

### AI 전달: 인벤토리는 상시, 상세는 툴

**툴만 두면 원래 실패가 재현된다.** 모델은 프롬프트에서 현재 세션 하나만 보고, 툴 규칙은
"이미 있는 데이터로 답할 수 있으면 쓰지 마라"로 억제 방향이다 — 퀄리 데이터가 존재한다는
사실을 알 방법이 없다.

- **주말 인벤토리를 상시 적재**(초경량): 세션명·종료시각·결과 유무 5행. 모델이 "무엇을
  물을 수 있는지" 알게 하는 최소 정보
- **상세 표는 툴로**: `queryWeekendResults(session?, driver?)` — session 은 인벤토리에서
  본 이름/키. docs/26 의 공용 툴 정의·executor 구조를 쓴다
- **툴 등록은 두 곳**: 도메인 `QUESTION_TOOL_DEFINITIONS` + `apps/web/src/lib/AiProvider.ts`
  의 분기. 프로덕션 executor 는 `createQuestionToolExecutor`(테스트 전용)가 아니라
  AiProvider 의 손수 짠 분기다(그 파일의 TODO 참고). **이번에 그 중복을 합칠지 결정한다** —
  합치는 편을 권하되, 범위가 커지면 양쪽에 넣고 TODO 를 유지
- **툴 루프는 현재 Gemini 전용**이다(Claude/OpenAI 미구현). 다른 provider·Mock 은 툴 없이
  기존 답을 하고, Fallback 이 통과해야 한다(docs/26 수용 기준 8)
- **경량 경로만**: `sessions?meeting_key` + `session_result?meeting_key` + `drivers?meeting_key`
  = **주말당 3요청**. `fetchOpenF1SessionData`(11요청·7초)를 **타지 않는다** — 툴 루프는
  라운드당 예산이 있고 최악 4콜이라 지연이 무너진다(docs/26 수용 기준 12)
- **`meeting_key` 필터 필수** — session_key 는 미팅 내에서 불연속이다(1291: 11335~11338,
  11342). 범위 쿼리 금지
- **툴 결과에 근거 주말**(meetingName·종료시각)을 실어 모델이 명시하게 한다 — 다음 주말
  직전엔 "최근 종료 주말"이 지난 GP 라 조용한 오답이 난다

### 주말 판정

- 입력은 **스냅샷의 `meetingKey`**(필수 필드다 — `LiveRaceSnapshot.ts:14`)
- 폴러는 고정 문서에 latest 세션을 덮어쓰므로 **세션 종료 후에도 마지막 프레임이 남는다**.
  "라이브인지"는 서버가 직접 모른다 → `status`·`generatedAt` 신선도로 판정하고 규칙을 한
  곳에 둔다(UI·툴 공유)
- **미확정·취소·조회 실패를 구분해 반환**한다 — 취소 세션은 404, 진행 중은 비거나 부분.
  빈 배열을 주면 모델이 "없다"로 답한다. 기존 `is_cancelled` 필터와 30분 정산 여유
  (`ARCHIVE_SETTLE_MARGIN_MS`)를 재사용
- **Mock/Replay 는 `meetingKey: 8001`(OpenF1 에 없음)** — 빈 결과가 정상 동작임을 명시
- 오프시즌엔 굳은 문서가 지난 시즌일 수 있다 → 근거 주말 표기로 드러나게 한다

### UI: 진행 중 주말도 연다 (사용자 결정)

지금 아카이브 상세는 **완료된 Race 목록에 있는 sessionKey 만** 열린다 — 게이트가 두 겹이다
(`ArchiveLoader.ts:188-196` + `ArchiveService.ts:48-56`). 그래서 **토요일 퀄리 종료 후
일요일 레이스 종료 전까지 그 주말은 화면에 존재하지 않는다.** 이 스펙을 만든 질문이 정확히
그 시간대에 나왔다.

- **주말 단위 진입**을 만든다 — 목록에 "진행 중 주말"을 포함하고, 상세에서 세션을 고른다
  (지금 목록은 세션 단위라 스프린트 주말이 2행으로 나오고 슬러그가 중복된다 — 함께 정리)
- **Race 게이트 2곳을 뚫는다.** 결과표만 필요한 FP·퀄리 탭은 `loadArchiveRaceDetail`
  (11요청 + 레이스 전제 정규화)을 타지 말고 **session_result + drivers 경량 경로**로 분리
- **퀄리 표는 새 뷰다** — 기존 `ArchiveResultsView` 는 position/driver/gap/laps/points 고정
  열이라 Q1/Q2/Q3 3열·진출 구분선을 담지 못하고, points 는 빈 열이 된다. 행 레이아웃·팀
  컬러·배지 수준만 재사용
- **프랙티스도 기존 표를 그대로 쓰면 안 된다** — 베스트랩이 "총 시간" 열에 들어간다
- `ArchiveRaceDetailView` 의 `RaceSummaryView`(우승자·포디움·총 추월·피트)는 **비레이스
  세션에 의미가 없다** — 세션 타입 분기로 감춘다(지금은 스냅샷 상위 3위를 포디움으로 뽑아
  조용히 틀린 의미를 표시한다)
- i18n(en/ko/ja)·터치 타깃 44pt 는 기존 기준 그대로

## 범위 밖

- 라이브 퀄리파잉 진행 화면(Q1/Q2/Q3 실시간) — 이번은 **끝난 세션 결과**만
- 프랙티스 롱런·타이어 스틴트 분석 — 결과표까지
- 107% 룰 판정 — OpenF1 에 신호가 없다
- 과거 시즌 주말 — 현재 시즌
- 퀄리 결과를 스냅샷 contextSummary 에 상시 적재 — 인벤토리만 상시, 상세는 툴

## 수용 기준

1. **스프린트 주말**(meeting 1289)에서 FP1·Sprint Qualifying·Sprint·Qualifying·Race
   5세션이 모두 지목·표시되고, SQ 세그먼트가 SQ1/SQ2/SQ3 로 라벨된다
2. 세션 지목이 고정 enum 이 아니라 미팅의 실제 세션 목록에서 도출된다. `toSessionId` 의
   FP1/2/3 충돌과 스프린트 주말 Race 중복이 해소된다
3. `duration`·`gap_to_leader` 가 스칼라/배열 양쪽을 타입 안전하게 다룬다. **형태 분기 우선,
   null 일 때만 session_type 폴백**
4. 프랙티스(베스트랩)·레이스(총 시간)·퀄리(세그먼트)가 **의미가 다른 별도 타입**으로 나뉜다.
   레이스 랩다운 `gapLabel`("+1 LAP")이 보존된다
5. 세그먼트 랭크를 계산한다 — non-null 기록자끼리 정렬, 동률은 driverNumber. `position` 과
   혼동하지 않는다. **회귀: 11338 #27 HUL → Q1 6위, 최종 P10**
6. **`reachedSegment` 를 참가자 수·finalPosition 밴드로 판정**한다. "Q3 진출·무기록"을
   Q2 탈락으로 오판하지 않는다. **회귀: 11303 #16 · 11330 #6 · 11230 #5**
7. 구멍 패턴(11276 #6 `[null, 88.941, 88.789]`)·`position: null`·행 결측(멜버른 19행)이
   안전하게 처리된다
8. 드라이버 코드가 `drivers?meeting_key` 조인으로 채워져 "휠켄버그"로 조회된다
9. **주말당 3요청 이내**(sessions·session_result·drivers). `fetchOpenF1SessionData` 미사용.
   `meeting_key` 필터 사용(session_key 범위 금지)
10. 미확정·취소(404)·조회 실패를 **구분해 반환**하고 모델이 "없다"로 뭉개지 않는다
11. 주말 인벤토리가 상시 적재되어 모델이 주말 데이터의 존재를 안다. 툴 결과에 근거 주말이
    실린다
12. 툴이 3개가 되어도 단순 질문 **오발동이 늘지 않는다**(docs/26 수용 기준 7 회귀)
13. Mock·Fallback·비-Gemini provider 가 툴 없이 정상 동작한다
14. **진행 중 주말**(퀄리 종료~레이스 전)이 화면에서 열린다 — 이 스펙을 만든 시나리오
15. 퀄리 표가 Q1/Q2/Q3 열·진출 구분선을 갖고, 프랙티스 베스트랩이 "총 시간" 열에 들어가지
    않으며, 비레이스 세션에 포디움 요약이 뜨지 않는다. i18n 3로케일
16. `ARCHIVE_CACHE_VERSION` 이 올라간다. `points` 가 optional 로 정정된다
17. 도메인 테스트는 **저장된 픽스처**로 돈다(네트워크 금지). 실측 인용값 고정
18. 실 LLM e2e: "휠켄버그 Q1 몇 위?" 가 **Q1 6위**로 답된다(값까지 검증)
