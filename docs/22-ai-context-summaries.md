# 22. AI 컨텍스트 강화 — 원본 요약을 워커가 계산해 싣는다

## 배경

AI 질문의 답변 품질이 낮다. 실측으로 원인 둘을 확인했다.

### 1. 이벤트가 최신 8건, 우선순위 무시

`buildQuestionContext` 가 `recentEvents.slice(-8)` 로 **시간순 최신 8건**만 준다.
우선순위 필터가 없다. 벨기에 GP 839건 중 `overtake` 214 · `override_range_entered`
194 · `gap_closing` 119 가 후반에 쏟아져 최신 8건을 다 차지한다. 그래서
`pit_stop`(28건)·`penalty`·`investigation` 이 8건 밖으로 밀린다.

사용자가 "타이어 피트인 이벤트가 왜 없냐" 고 물은 게 이 증상이다. AI 가 받는 이벤트
맥락이 "방금 일어난 사소한 것 8건" 이다.

### 2. 원본 엔드포인트의 풍부한 필드를 이벤트로 부풀리거나 버린다

OpenF1 원본(실측):

| 엔드포인트 | 원본 필드 | 지금 |
|---|---|---|
| `pit` (28) | `pit_duration` 24.156초, `lap_number` | 이벤트에 compound 만. **시간 버림** |
| `stints` (51) | compound, `lap_start`~`lap_end`, `tyre_age_at_start` | compound·나이만 스냅샷에. **스틴트 이력 버림** |
| `overtakes` (214) | 추월/피추월 드라이버 | **이벤트 214건으로 부풀림 = 소음의 정체** |
| `session_result` (22) | 최종순위·points·dnf·gap | retirement 3건만 씀 |

`overtake` 214건은 원본을 이벤트로 1:1 부풀린 것이다. AI 질문 맥락에 개별 추월
214건은 필요 없다 — 필요한 건 "총 214회, 후반 집중" 같은 **요약**이다.

## 원칙: 결정론적 요약, 워커가 계산

피트 시간·스틴트·추월은 **집계다. LLM 이 필요 없다.** 이 레포의 "결정론적 코어"
원칙(docs/02 §3.1) 그대로 — 지어낸 수치가 아니라 원본에서 계산한 값이라 환각이 없다.

**요약 생성은 워커가 한다.** 조사 결론: 라이브에서 원본(pit_duration·stints·
overtakes·session_result)을 유일하게 쥐는 지점이 워커(`PollRunner` 의
`fetchOpenF1SessionData` 직후)다. Firestore 엔 정규화 스냅샷만 저장하고 원본을
버리므로, 질문 시점엔 재료가 없다. 워커가 요약을 계산해 스냅샷에 실어 저장한다
(아키텍처 원칙 "워커가 계산, 클라이언트는 계산 안 함" 과 정합).

대안 (b) "`/api/ask` 가 OpenF1 직접 조회" 는 질문마다 11요청이라 비용·지연이 크다.
버린다.

## 설계

### A. 이벤트 우선순위 선별 (작고 즉효)

`buildQuestionContext` 가 시간순 자르기 전에 **우선순위·타입으로 거른다.**

- **넣기**: penalty · safety_car · virtual_safety_car · red_flag · pit_stop ·
  investigation · retirement · track_hazard · session_restarted · strategy_note ·
  fastest_lap · rain_risk
- **빼기**: overtake · gap_closing · gap_increasing · override_range_entered ·
  personal_best_lap · blue_flag · sector_yellow · sector_clear · track_limits ·
  team_radio · position_change · overtake_mode_enabled/disabled

빼는 것들은 화면 피드엔 유용해도 질문 맥락엔 소음이다. 넣는 것만 세면 벨기에 GP
기준 ~60~80건이라 8건보다 훨씬 풍부하면서 527건 소음을 걷어낸다. 상한은 넉넉히
(예: 40건) 두되 우선순위 순으로 채운다.

이 화이트리스트는 이미 있는 `selectCommentaryEvents` / `CommentaryEventAllowlist`
와 겹친다. 재사용하거나 같은 원리로 맞춘다 — 두 벌을 만들지 않는다.

### B. 원본 요약을 스냅샷에 싣는다 (제대로)

워커가 원본에서 계산해 `LiveRaceSnapshot` 에 요약 필드로 얹는다. 클라이언트가
스냅샷을 그대로 `/api/ask` 로 흘려보내면 provider 컨텍스트에 들어간다.

담을 요약 (전부 결정론적 집계):

- **피트**: 총 횟수, `pit_duration` 중앙값. 드라이버별 최근 정지 랩·compound
  (스냅샷에 pitStopCount·compound 는 있으나 **시간은 없다** — 이게 새로 추가되는 값)
- **타이어/스틴트**: 드라이버별 현재 스틴트 (compound · 시작랩 · 현재 나이). 스냅샷의
  compound·tireAgeLaps 를 스틴트 맥락으로 확장
- **추월**: 총 횟수, (가능하면) 활발한 구간/드라이버. 214 이벤트를 요약 한 덩어리로 압축

**session_result 는 라이브에서 제외한다.** 세션 종료 후에만 채워진다(실측). 진행 중엔
비어 있으므로 라이브 요약에 넣지 않는다. 아카이브(끝난 세션)엔 유효 — 별도.

### 계약 확장

- `LiveRaceSnapshot` + `RaceSnapshotSchema` 에 요약 필드 추가 (optional — mock·replay·
  옛 스냅샷에 없어도 안전)
- provider 3곳의 `buildQuestionContext` 가 요약을 컨텍스트 JSON 에 포함. **공용화**를
  검토 — 지금 세 벌인데 요약을 세 번 더 추가하면 갈라진다
- `LlmQuestionRequest` 는 스냅샷 안에 요약이 실리므로 **새 최상위 필드 불필요**할 수 있다.
  판단한다

### 피트 시간의 한계 (실측)

우리 `OpenF1Pit` 타입엔 `pit_duration` 하나뿐이다. OpenF1 원본엔 `stop_duration`·
`lane_duration` 도 있으나 우리가 조회·저장하지 않는다. "중앙값 24.2초" 는 되지만
정지/레인 구분은 안 된다. 세분화가 필요하면 `OpenF1Client`·`OpenF1Types` 부터
확장한다 — **이번 범위 밖.** 우선 `pit_duration` 으로 간다.

## 순서

A(이벤트 선별)를 먼저 한다 — 작고, 지금 당장 답변 품질을 올리며, B 와 독립이다.
그 다음 B(요약)로 간다.

## 범위 밖

- 피트 `stop_duration`·`lane_duration` 세분화 (타입 확장 필요)
- session_result 라이브 요약 (종료 후에만 유효)
- 주말 컨텍스트(프랙티스·퀄리) — 별도 스펙 (docs/23 예정)
- 큐레이션 지식 파일(2026 규정·서킷 성격) — 별도
- 라이브 authoritative 스냅샷 서버 읽기 TODO (기존, 무관)

## 수용 기준

1. AI 질문 이벤트 컨텍스트가 우선순위·타입으로 걸러진다. overtake·gap·override 등
   고빈도 저의미 타입이 빠진다.
2. 넣는 이벤트가 8건보다 넉넉하고(예: 40건 상한) 우선순위 순으로 채워진다.
3. 워커가 피트·타이어·추월 요약을 계산해 스냅샷에 싣는다. 결정론적 집계다.
4. 요약이 optional 이라 mock·replay·옛 스냅샷에서 안전하게 생략된다.
5. provider 3곳이 요약을 컨텍스트에 포함한다. 조립이 갈라지지 않는다.
6. session_result 는 라이브 요약에 넣지 않는다.
7. 도메인 단위 테스트: 이벤트 선별 · 요약 집계 (피트 중앙값·스틴트·추월 카운트).
8. 벨기에 GP 실데이터로 요약 값이 측정치와 일치함을 회귀 테스트로 고정.
