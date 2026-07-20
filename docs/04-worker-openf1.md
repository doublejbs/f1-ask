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

> 비밀값(계정·토큰)의 실제 값은 이 문서에 적지 않는다. 셸 환경이나 로컬 시크릿 파일에서 주입할 것.

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

## 폴러 종료

**반드시 `pkill -9 -f vitest` 를 쓴다.**

```bash
pkill -9 -f vitest
```

테스트 경로로 kill 하면 안 죽는다. vitest 는 실제 테스트를 워커 프로세스에서 실행하는데, 그 워커의 argv 에는 테스트 파일 경로가 들어 있지 않다(경로는 부모가 IPC 로 넘긴다). `pkill -f OpenF1LivePoll` 같은 명령은 부모만 잡거나 아무것도 못 잡고, 폴링 루프를 돌리는 워커는 계속 살아서 에뮬레이터에 쓰기를 이어간다. `vitest` 로 매칭해야 부모·워커가 함께 정리된다.
