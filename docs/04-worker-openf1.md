# 04. Cloud Run Worker & OpenF1

## 현재 상태

OpenF1 폴러는 **아직 배포된 워커가 아니다.** 지금은 vitest 기반 개발 하네스(`packages/domain/test/OpenF1LivePoll.test.ts`)로만 존재한다. 이 파일은 실제 OpenF1 API 를 폴링해 정규화한 스냅샷과 이벤트를 로컬 Firestore 에뮬레이터에 퍼블리시하며, 웹 클라이언트가 라이브 데이터를 구독하는 것을 로컬에서 확인하기 위한 용도다.

테스트로 위장한 실행 스크립트이므로 `POLL_OPENF1=1` 이 없으면 skip 된다. 일반 테스트 실행(`pnpm exec vitest run`)에는 영향을 주지 않는다.

향후 Cloud Run 워커로 옮길 때 폴링 루프의 로직(스냅샷 빌드·이벤트 dedup·Firestore 쓰기)을 그대로 재사용한다.

## 사전 준비

Firestore 에뮬레이터가 떠 있어야 한다.

```bash
pnpm exec firebase emulators:start --only firestore
```

### 8080 포트가 이미 잡혀 있을 때

에뮬레이터는 `firebase.json` 에 따라 8080 을 쓴다. 다른 프로세스(이전 실행이 남긴 에뮬레이터, 다른 워크트리의 에뮬레이터, 무관한 서버)가 점유하고 있으면 기동이 실패한다.

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

- **이전 에뮬레이터가 남은 것이면** 그 프로세스를 정리하고 다시 띄운다.

  ```bash
  pkill -f "firebase.*emulators"
  ```

- **다른 용도로 쓰는 포트라면** 죽이지 말고 에뮬레이터를 다른 포트로 띄운다. 하네스가 붙는 곳은 `FIRESTORE_EMULATOR_HOST` 하나이므로 **두 값을 같이 바꾸면 된다.**

  ```bash
  pnpm exec firebase emulators:start --only firestore --port 8085
  # 이후 모든 하네스 실행에서
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 ...
  ```

  `apps/web` 도 같은 에뮬레이터를 보므로 웹까지 함께 확인할 때는 웹 쪽 에뮬레이터 포트 설정도 같은 값으로 맞춘다.

## 환경변수

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `POLL_OPENF1` | 필수 | `1` 이어야 폴러가 실행된다. 없으면 skip. |
| `FIRESTORE_EMULATOR_HOST` | 필수 | 예: `127.0.0.1:8080`. admin SDK 가 에뮬레이터로 붙는다. |
| `OPENF1_USERNAME` / `OPENF1_PASSWORD` | 택1 | OpenF1 계정. 토큰을 자동 갱신하므로 장시간 실행에 권장. |
| `OPENF1_API_KEY` | 택1 | 단기 정적 토큰. 발급 후 1시간이면 만료된다. |
| `GCLOUD_PROJECT` | 선택 | 기본값 `demo-f1`. |
| `POLL_ITERATIONS` | 선택 | 폴링 횟수. 기본 `20`. |
| `POLL_INTERVAL_MS` | 선택 | 폴링 간격(ms). 기본 `6000`. |
| `POLL_REPLAY_SPEED` | 선택 | 설정하면 리플레이 모드. 아래 참고. |
| `POLL_COMMENTARY` | 선택 | `1` 이면 AI 해설도 생성한다. 기본은 꺼짐. 아래 참고. |
| `GEMINI_API_KEY` | 해설 시 필수 | 해설 생성용 LLM 키. 웹·워커와 같은 이름이다. |
| `COMMENTARY_VARIANTS` | 선택 | 생성할 변형. 기본 `ko:standard`. 워커와 같은 이름·형식이다. |
| `POLL_COMMENTARY_CALL_CAP` | 선택 | 총 LLM 호출 수 상한. 기본 `60`. |
| `POLL_COMMENTARY_BUDGET_MS` | 선택 | 해설 단계 전체의 벽시계 상한(ms). 기본 `600000`. |
| `POLL_COMMENTARY_RESET` | 선택 | `1` 이면 기존 해설과 러닝 컨텍스트를 지우고 처음부터 다시 생성한다. |

> 비밀값(계정·토큰·API 키)의 실제 값은 이 문서에 적지 않는다. 셸 환경이나 로컬 시크릿 파일에서 주입할 것.

## 라이브 모드

`POLL_REPLAY_SPEED` 를 주지 않으면 라이브 모드다. 매 폴링마다 OpenF1 을 새로 조회하고 `Date.now()` 를 현재 시각으로 써서 스냅샷/이벤트를 만든다. 실제 진행 중인 세션을 따라갈 때 쓴다.

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
OPENF1_USERNAME="$OPENF1_USERNAME" \
OPENF1_PASSWORD="$OPENF1_PASSWORD" \
POLL_OPENF1=1 \
pnpm exec vitest run packages/domain/test/OpenF1LivePoll.test.ts
```

## 리플레이 모드

진행 중인 세션이 없을 때(대부분의 개발 시점) 라이브 모드는 쓸모가 없다. 대상이 이미 끝난 레이스라 매 폴링마다 레이스 전체가 한꺼번에 들어오고 그 뒤로 아무것도 변하지 않는다. 이벤트가 하나씩 쌓이는 것도, 랩이 진행되는 것도, 순위가 바뀌는 것도 볼 수 없다.

`POLL_REPLAY_SPEED` 를 주면 **가상 시계**로 종료된 세션을 처음부터 재생한다.

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
OPENF1_USERNAME="$OPENF1_USERNAME" \
OPENF1_PASSWORD="$OPENF1_PASSWORD" \
POLL_OPENF1=1 \
POLL_REPLAY_SPEED=60 \
POLL_ITERATIONS=3000 \
POLL_INTERVAL_MS=2000 \
pnpm exec vitest run packages/domain/test/OpenF1LivePoll.test.ts
```

### `POLL_REPLAY_SPEED` 의미

배속이다. 실제 1초가 경기 시간 N 초에 대응한다.

```
simulatedNowMs = startMs + (Date.now() - wallClockStartMs) * POLL_REPLAY_SPEED
```

- `POLL_REPLAY_SPEED=1` — 실시간 재생.
- `POLL_REPLAY_SPEED=60` — 실제 1초가 경기 60초. 약 90분 레이스가 실제 1.5분에 끝난다.

`startMs` 는 랩 `date_start` 의 최솟값(라이브 모드와 동일한 계산)이다.

### 리플레이 모드 동작

- **데이터 1회 조회** — 종료된 세션이라 원본이 변하지 않으므로 루프 시작 전 한 번만 조회하고 재사용한다. 라이브 모드는 기존대로 매 폴링마다 조회한다.
- **기존 이벤트 삭제** — 시작 시 `sessions/{sessionId}/events` 하위 문서를 admin SDK 로 모두 지운다. 안 그러면 이전 실행이 남긴 문서 때문에 "처음부터 재생"이 되지 않는다. (에뮬레이터 REST DELETE 는 보안 규칙에 막히지만 admin SDK 는 규칙을 우회한다. 문서가 수백 건이라 배치 상한 500 단위로 끊어 지운다.)
- **종료 조건** — 가상 시각이 세션 끝(가장 늦은 랩/이벤트 시각)에 도달하면 마지막 프레임까지 퍼블리시한 뒤 루프를 종료하고 로그를 남긴다. `POLL_ITERATIONS` 를 먼저 소진해도 끝난다.
- **freshness** — `sourceUpdatedAt` / `generatedAt` 은 가상 시각이 아니라 **실제 현재 시각**을 쓴다. 클라이언트의 freshness 판정이 실제 시계 기준이라, 가상 시각을 넣으면 화면에 "오래됨"으로 표시된다.

### 로그 읽기

```
replay 12/3000: t+18:30 (42%) lap 19/44, 22 drivers, 87 events
```

- `t+18:30` — 세션 시작 기준 가상 경과 시간
- `(42%)` — 세션 전체 길이 대비 진행률
- 뒤쪽은 현재 랩 / 드라이버 수 / 누적 이벤트 수

## AI 해설 생성 (`POLL_COMMENTARY=1`)

해설 워커(docs/18-ai-commentary-worker.md)는 실제 F1 세션이 있어야 도는데 세션은 드물다. 리플레이 하네스에 해설 생성을 붙여 **지난 레이스로 프로덕션 경로를 검증**한다. 얻는 것은 둘이다.

1. **경로 검증** — 시간순 처리 · 변형별 러닝 컨텍스트 격리 · 재시도 상한 · 시간 예산 · 멱등 문서 id
2. **품질 확인** — 연속 생성된 문장을 사람이 읽고 판단한다. 러닝 컨텍스트가 실제로 반복을 줄이는지는 단발 호출로는 확인되지 않는다

**기본은 꺼짐이다.** `POLL_COMMENTARY=1` 을 주지 않으면 이 파일은 예전과 완전히 같게 동작하고 LLM 을 한 번도 부르지 않는다.

### API 키 등록

`GEMINI_API_KEY` 를 셸 환경에 넣는다. **값은 이 문서에도 레포에도 적지 않는다.**

```bash
export GEMINI_API_KEY="..."   # 값은 각자 발급받은 것을 쓴다
```

키가 없으면 해설 생성을 **켜지 않고** 안내만 찍는다. mock 문장으로 조용히 도는 일은 없다 — mock 이 그럴듯하게 찍히면 "잘 됐다" 고 오해하게 된다. provider 선택은 워커와 같은 `createRaceLlmProvider` 경로를 쓴다.

### 실행

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
OPENF1_USERNAME="$OPENF1_USERNAME" \
OPENF1_PASSWORD="$OPENF1_PASSWORD" \
GEMINI_API_KEY="$GEMINI_API_KEY" \
POLL_OPENF1=1 \
POLL_COMMENTARY=1 \
POLL_REPLAY_SPEED=600 \
POLL_ITERATIONS=200 \
POLL_INTERVAL_MS=1000 \
pnpm exec vitest run packages/domain/test/OpenF1LivePoll.test.ts
```

같은 레이스를 **처음부터 다시** 생성하려면 (LLM 을 다시 부른다 — 비용이 다시 나간다):

```bash
POLL_COMMENTARY_RESET=1 ... # 위 명령에 한 줄 더한다
```

### 생성 시점

**폴링 루프가 끝난 뒤 일괄 생성한다.** 워커(`functions/src/PollRunner.ts`)와 같은 순서다. 루프 안에서 LLM 을 기다리면 폴링 간격이 통째로 밀려 데이터가 성겨진다(docs/18 §생성 주체). 러닝 컨텍스트도 워커와 같이 **창당 읽기 1 · 쓰기 1** 이다.

### 출력 읽기

```
commentary enabled: 호출 상한 60회, 이미 생성된 해설 0건 (예상 호출 수는 폴링 종료 후 알린다)
...
해설 provider: Gemini (gemini-3.5-flash), 변형 ko:standard
해설 생성 계획: 이벤트 312건 중 해설 대상 47건, 예상 LLM 호출 47회 (상한 60회)

── 생성된 해설 (이벤트 시간순) ──
[  1] OK   2026-07-27T13:05:02.000Z safety_car (session) ko:standard
        세이프티카가 투입되며 ...
[  2] FAIL 2026-07-27T13:06:11.000Z retirement (driver) ko:standard
        실패: 429 quota exceeded

── 해설 생성 요약 ──
총 이벤트 312건 · 해설 대상 47건 · 예상 호출 47회
성공 46 · 실패 1 · mock 폐기 0 · 시간예산 이월 0 · 재시도 포기 0
실제 LLM 호출 47회 (상한 60회)
```

**시간순**으로 찍는 것이 핵심이다. 연속된 문장이 서로 다른 이야기를 하는지가 이 하네스의 관전 포인트다.

`실제 LLM 호출` 이 `예상 호출` 보다 크게 많으면 재시도 폭주를 의심한다. "레이스당 47회 고정" 이 워커 이전의 목적이므로 이 숫자가 그 목적의 검증값이다.

### 비용 안전장치

Gemini 무료 티어는 일 250회, 지출 상한은 $5 다. 하네스가 폭주하면 실제 돈이 나간다.

- **총 호출 수 상한** — 기본 60회(`POLL_COMMENTARY_CALL_CAP`). 넘기면 그 이벤트부터 생성하지 않고 몇 회를 남겼는지 출력한다. 상한은 **이벤트 단위**로 자른다 — 변형이 둘 이상일 때 한 이벤트의 ko 만 있고 en 은 없는 상태가 남지 않는다
- **실행 전 예고** — 폴링이 끝나면 생성 전에 예상 호출 수와 상한을 먼저 찍는다. 상한이 사후 통보가 되지 않는다
- **기본 꺼짐** — `POLL_COMMENTARY` 없이는 LLM 을 부르지 않는다
- **재생성 억제** — 러닝 컨텍스트에 이미 만든 해설 id 가 남으므로 같은 리플레이를 다시 돌려도 다시 사지 않는다. 굳이 다시 만들려면 `POLL_COMMENTARY_RESET=1` 을 명시한다
- **mock 은 저장하지 않는다** — LLM 이 실패해 mock 으로 폴백한 건은 `MOCK` 으로 표시만 하고 Firestore 에 쓰지 않는다(docs/18 §폴백)

변형을 늘리면 호출 수가 그만큼 곱해진다. `COMMENTARY_VARIANTS=ko:standard,en:beginner` 는 호출이 2배다. 상한도 함께 올려야 하는데, **올리기 전에 무료 티어 잔량을 확인할 것.**

### 이 하네스가 검증하지 않는 것

- **스케줄 · 리스** — 워커의 1분 기동, `workerLeases` 취득/해제, 중복 인스턴스 방지는 하네스에 없다. 하네스는 한 프로세스가 한 판 도는 구조다
- **기동 간 이어받기** — 워커는 러닝 컨텍스트를 여러 기동에 걸쳐 이어받는다. 하네스는 한 판이라 그 경계가 한 번밖에 없다
- **함수 타임아웃 · 리스 TTL 기반 시간 예산** — 하네스의 예산은 벽시계 상한일 뿐, 워커의 `COMMENTARY_PHASE_END_MS` 계산과 다르다
- **클라이언트 구독 경로** — 해설이 화면에 뜨는 것은 별도로 확인해야 한다
- **실제 라이브 데이터의 성질** — 리플레이는 끝난 세션의 데이터가 완전한 상태에서 시작한다. 라이브에서 부분적으로만 도착하는 데이터로 이벤트가 어떻게 갈라지는지는 재현되지 않는다

## 폴러 종료

**반드시 `pkill -9 -f vitest` 를 쓴다.**

```bash
pkill -9 -f vitest
```

테스트 경로로 kill 하면 안 죽는다. vitest 는 실제 테스트를 워커 프로세스에서 실행하는데, 그 워커의 argv 에는 테스트 파일 경로가 들어 있지 않다(경로는 부모가 IPC 로 넘긴다). `pkill -f OpenF1LivePoll` 같은 명령은 부모만 잡거나 아무것도 못 잡고, 폴링 루프를 돌리는 워커는 계속 살아서 에뮬레이터에 쓰기를 이어간다. `vitest` 로 매칭해야 부모·워커가 함께 정리된다.
