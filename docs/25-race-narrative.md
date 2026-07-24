# 25. 경기 러닝 내러티브 — 결정론적 다이제스트로 "전체 컨텍스트" 채우기

## 배경

라이브 세컨드 스크린에서 AI에게 질문할 때, 지금 넘어가는 컨텍스트는 세 조각이다:

1. 스냅샷의 **현재 상태** (순위·갭·타이어)
2. `contextSummary`의 **집계** (피트 총 횟수·중앙값, 스틴트, 추월 총량 — docs/22 §B)
3. **최근 중요 이벤트 40건** (우선순위 선별 — docs/22 §A)

빠진 것은 **"경기 전체의 서사"**다. "왜 ANT가 선두인지", "VER이 어디서 순위를 잃었는지",
"이번 피트 웨이브가 언제였는지" 같은 건 최근 40건에도, 집계에도 없다. 사용자가
"지금까지 경기 어땠어?" 라고 물으면 AI는 파편만 들고 답한다.

경기는 랩 44개·이벤트 수천 건이라 전부 프롬프트에 담을 수 없다. "전체 컨텍스트
유지"는 프롬프트를 키우는 문제가 아니라 **압축·조립 문제**다.

## 원칙: 내러티브도 산수다 (워커에 LLM 을 넣지 않는다)

러닝 내러티브를 LLM 요약으로 만들고 싶은 유혹이 있다. **하지 않는다.** 이유:

- 워커가 매 폴링 창(1분)마다 LLM 을 부르면 레이스당 ~90회 추가 호출 — 비용·지연
- 요약 자체가 확률적이라 이 레포의 "결정론적 코어"(docs/02 §3.1)와 충돌한다.
  집계는 지어낸 수치가 없는데 요약은 드리프트·환각이 생긴다
- 어차피 이 다이제스트를 받는 건 답변 LLM 이다. **다이제스트는 구조적 사실,
  문장화는 답변 LLM 의 몫**으로 나누면 결정론과 자연스러운 답변을 둘 다 얻는다

즉 코드가 이벤트·집계에서 "경기 전체 사실"을 **구조적으로 조립**하고, 답변 LLM 이
그걸 문장으로 바꾼다. 워커에 LLM 추가 없음, 환각 없음, 추가 지연 없음.

이는 `contextSummary`(docs/22 §B)를 "집계"에서 "집계 + 서사형 핵심 사실"로 **확장**하는
것이다. 새 파이프라인이 아니라 `buildLiveContextSummary` 에 필드를 더한다.

## 설계

### 계산 위치: 기존 contextSummary 경로 그대로

- `packages/domain/src/openf1/OpenF1ContextSummary.ts` 의 `buildLiveContextSummary`
  가 nowMs 시점까지 집계하듯, 서사 필드도 같은 함수에서 같은 시점 규칙으로 조립
- **Zod 스키마 갱신 필수**: `packages/schemas` 의 `liveRaceContextSummarySchema` 에
  narrative 를 추가하지 않으면 Firestore read(`parseLiveRaceSnapshot`)와 `/api/ask` 바디
  파싱(`AskAiSchema` 의 `snapshot`)에서 **zod 가 조용히 strip** 해 provider 도달 전에
  사라진다. 이걸 빼면 "자동 포함"이 런타임에 실패한다
- 워커(`buildOpenF1LiveFrame`)가 스냅샷에 실어 저장 → `/api/ask` 가 스냅샷을 그대로
  받으므로 질문 컨텍스트에 **자동 포함** (추가 read 0)
- `PublishDecision` 은 이미 `contextSummary` 를 지문에서 제외한다(쓰기 증폭 방지).
  서사 필드도 그 안이라 별도 처리 불필요. **단** 순수 narrative 변동(본체 불변)은 즉시가
  아니라 heartbeat(12s) 주기로 전파된다 — 대개 lead change·SC 는 본체(position·status)도
  바꿔 동반 전파되므로 실무 영향은 작다(오늘 contextSummary 와 동일 트레이드오프)
- 3 provider 는 이미 `toQuestionSummaryContext` 하나로 요약을 주입한다. 필드가
  늘어도 조립이 갈라지지 않는다
- `LiveRaceContextSummary.ts` 타입 주석이 이 타입을 "개별 이벤트로 흩어지면 소음이 되는
  집계"로 규정한다. narrative(아크 사실)는 성격이 다르므로 주석을 갱신해 자기모순을 없앤다

### 담을 서사 (전부 결정론적, nowMs 시점까지)

`LiveRaceContextSummary` 에 `narrative` 서브객체 추가. **상한은 필드 성격별로 다르다**
— 자연 유계인 것은 자르지 않고, 무한정 늘 수 있는 것만 상위 N 으로 캡한다. 리타이어를
상한으로 자르면 잘린 드라이버가 "아직 달리는 중"으로 오인되므로 **절대 자르지 않는다.**

| 필드 | 내용 | 출처 | 상한 |
|---|---|---|---|
| `progress` | 랩 X/Y, 세션 국면(green/sc/...) | 스냅샷 | 1건 |
| `leadChanges` | **선두를 잡은 순서**(트랙 추월이 아니라 리드 보유 시퀀스) | position=1 이력 재구성 | 자연 유계, 무상한 |
| `retirements` | {driver, lap, reason?} 목록 | **§리타이어 참고** | **무상한** (자르면 거짓) |
| `pitWaves` | 피트가 몰린 랩 구간 (예: "L14–18 8대") | pits lap_number 클러스터 | 상위 ~5 구간 |
| `biggestMovers` | 그리드 대비 상승·하락 | positions 시계열 첫값 vs nowMs | **상승 3 · 하락 3** |
| `fastestLap` | 보유자·기록·랩 | laps `date_start <= nowMs` 재계산 | 1건 |
| `weatherShifts` | dry↔wet 전환 시점 (예: "L20 우천 시작") | weather 시계열 | 자연 유계, 무상한 |
| `safetyCars` | SC·VSC 발생 구간·랩 | raceControl 재구성 | 자연 유계, 무상한 |

이 다이제스트는 매 스냅샷 쓰기 + 매 질문에 실리므로 **직렬화 크기가 유계여야 한다**(수백
토큰 목표). 위 캡으로 최악의 경우 크기가 결정되며, 이를 테스트로 검증한다(수용 기준 §11).

### 리타이어 — 라이브엔 원본이 없다 (핵심 제약)

**실측**: 리타이어는 `sessionResults`(dnf/dns/dsq)에서만 나오고, `sessionResults` 는
**세션 종료 후에만** 채워진다(docs/22 §B 가 이미 명시). 라이브 스냅샷의 `retired` 는
`OpenF1Normalizer` 에서 하드코딩 `false` 다. 즉 **라이브 진행 중 `retirements` 는 채울
원본이 없다.**

이번 스펙은 (a) 를 택한다:

- **(a) 라이브 감지 원본 신설** — `raceControl` 의 "CAR {n} STOPPED"·블랙플래그·
  retired 성격 메시지를 nowMs 까지 순회해 라이브 리타이어를 결정론적으로 감지. race_control
  원본은 이미 조회·저장되고(필수 엔드포인트) 기존 분류 유틸이 있으니 그 원리를 따른다.
  세션 종료 후엔 sessionResults 가 더 정확하므로 아카이브는 그쪽을 우선
- 대안 (b) "아카이브 전용, 라이브 제외" 는 라이브 세컨드 스크린 목적("지금까지 서사")과
  맞지 않아 버린다. 단 (a) 의 race_control 리타이어 문구가 실데이터에서 신뢰할 만한지
  **벨기에·헝가리 픽스처로 먼저 실측**하고, 신뢰도가 낮으면 (b) 로 후퇴한다(구현 전 관찰)

### 기존 유틸 재사용 (두 벌 금지)

- **safetyCars**: `OpenF1SafetyCarClassification` · `OpenF1RaceControlCategory` 가 이미
  SC/VSC 를 판정한다. 새 분류기를 만들지 말고 재사용 (docs/22 "두 벌 만들지 않는다")
- **fastestLap**: 기존 FastestLap 이벤트 루프는 `<= nowMs` 게이팅이 **없다.** narrative 는
  `date_start <= nowMs` 로 명시 게이팅해 별도 계산 — 기존 루프를 그대로 쓰면 미래 랩이 샌다
- **biggestMovers 의 "그리드"**: `startingPosition`(스냅샷 필드)이 아니라 입력이
  `OpenF1SessionData` 뿐이므로 `positions` 시계열의 최초값으로 재구성. 그리드(페널티 반영)와
  L1 순위가 다를 수 있음을 주석에 명시

### 재시작·SC 왜곡 방지 (의미가 틀린 결정론 경계)

`position=1` 시계열의 leadChanges 는 트랙 추월뿐 아니라 **SC 중 선두 피트로 넘어간 리드·
레드플래그 재정렬로 생긴 리드**를 모두 포함한다. 결정론이라도 **의미가 틀릴** 수 있다.
그래서 leadChanges 를 "트랙 추월"이라 부르지 않고 **"선두를 잡은 순서"**로만 정의하고,
답변 프롬프트 규칙에 "leadChanges 는 리드 보유 순서이지 추월이 아니다 — 추월로 단정하지
말 것" 을 넣는다. biggestMovers 의 from 기준점은 그리드(positions 첫값)로 고정해 재시작을
가로질러도 정의가 흔들리지 않게 한다.

### 세션 초반 퇴행

L1~2 에선 biggestMovers 가 포메이션 셔플 소음, leadChanges 가 폴시터 하나뿐이다.
movers 는 **최소 경과 랩 임계**(예: 3랩 이후부터 계산)를 두고, 그 전엔 빈 배열을 준다.
narrative 는 optional 이므로 빈 필드는 프롬프트에서 자연히 생략된다.

### 이력이 필요한 필드의 처리 (leadChanges·safetyCars·movers)

집계(피트·추월)와 달리 leadChanges·safetyCars·biggestMovers 는 **시간에 걸친 변화**라
단일 스냅샷 데이터로 안 나온다. **원본 재구성으로 간다** — 리뷰에서 `OpenF1SessionData` 에
필요한 원본이 이미 있음을 확인했다:

- `positions`(필수 조회 엔드포인트) — 선두 시퀀스·그리드 대비 이동 재구성. 각 행 `date` 로
  nowMs 게이팅
- `raceControl`(필수 조회) — SC/VSC 구간, 라이브 리타이어 문구 감지
- 전부 `parseMs(row.date) <= nowMs` 규칙(기존 OvertakeForecast·contextSummary 와 동일)으로
  게이팅해 미래 누출을 막는다

스냅샷은 무상태로 유지되어 리플레이·아카이브가 그대로 동작한다(워커 runtime 문서에 상태를
누적하지 않는다). 성능은 문제없다 — positions·raceControl 은 소형이고 매 폴링 무거운
intervals 계산은 건드리지 않는다(리뷰 확인).

### 답변 프롬프트

`QuestionPrompt` 는 이미 `dataContext` JSON 을 받는다. narrative 가 그 안에 들어가면
끝이다. 프롬프트 규칙에 한 줄 추가: **"narrative 는 이미 일어난 사실이다. 이 안의
드라이버·랩·순위만 인용하고 없는 것을 지어내지 말 것"** (기존 반환각 규칙과 동종).

## 범위 밖 (이후 단계)

- **툴 사용 에이전트** (2단계): "VER 몇 랩에 피트?" 같은 임의 깊이 질문은 다이제스트로
  안 된다. 결정론 쿼리 툴(`queryDriverHistory` 등)을 LLM 이 호출하는 루프. provider 3곳에
  tool-calling 추상화 필요 — 별도 스펙(docs/26 예정)
- **라우터** (3단계): 간단한 질문 1샷 vs 깊은 질문 툴 루프 분기 (지연 관리)
- **LLM 요약 내러티브**: 위 원칙대로 제외
- **페널티**(판정 뒤집는 강등 포함): narrative 에 넣지 않는다. penalty·investigation 은
  이미 최근 이벤트 40건 화이트리스트(docs/22 §A)에 있어 그 경로가 담당한다. narrative 에
  중복 넣으면 갈라진다 — 명시적 배제다(무언의 누락 아님)
- **현재 배틀**: narrative 는 과거 아크만 담는다. 현재 접전은 스냅샷+최근 이벤트 소관이라
  넣지 않는다(명시적 경계)
- 과거 경기 기억: 아카이브가 담당 (별건)
- 해설 생성에 narrative 활용: 질문과 별개 경로 (별건)

## 수용 기준

1. `buildLiveContextSummary` 가 nowMs 시점까지의 narrative(진행·선두변경·리타이어·
   피트웨이브·최대이동·패스티스트·날씨전환·SC)를 결정론적으로 조립한다
2. 워커에 LLM 호출이 추가되지 않는다 (다이제스트는 순수 계산)
3. narrative 는 optional 이라 mock·replay·옛 스냅샷에서 안전하게 생략된다
4. **Zod 스키마**(`liveRaceContextSummarySchema`)에 narrative 가 추가되어 read·바디 파싱에서
   strip 되지 않는다
5. 상한이 필드 성격별로 적용된다: retirements·leadChanges·safetyCars·weatherShifts 무상한
   (자연 유계), biggestMovers 상승/하락 각 3, pitWaves 상위 ~5. **리타이어는 자르지 않는다**
6. `/api/ask` 컨텍스트에 narrative 가 자동 포함된다 (provider 3곳 갈라짐 없음)
7. 답변 프롬프트에 "narrative 는 사실, 지어내지 말 것" + "leadChanges 는 리드 보유 순서이지
   추월이 아니다" 규칙이 있다
8. 도메인 단위 테스트: 각 서사 필드 집계 (선두변경·피트웨이브 클러스터·최대이동·날씨전환)
9. **중간 nowMs 시점 일관성 회귀**: 경기 중간 nowMs 다이제스트가 그 이후의 선두변경·
   리타이어·SC·패스티스트를 포함하지 않는다 (미래 누출 없음 — 가장 깨지기 쉬운 불변식)
10. 벨기에 GP 실데이터로 narrative 값 회귀 고정 (알려진 사실). **단 리타이어는 라이브
    감지(race_control) 경로로 검증** — 종료 세션 sessionResults 로 통과하는 착시를 피한다
11. **직렬화 크기 상한 검증**: 최악 구성(리타이어 다수·movers 만석)에서 narrative JSON 이
    목표 토큰 예산(수백 토큰) 내인지 테스트로 고정
12. leadChanges·safetyCars·movers 가 원본 재구성으로 나온다 (스냅샷 무상태 유지)
13. 세션 초반(랩 임계 이전) movers 가 빈 배열이라 포메이션 셔플 소음을 내지 않는다
