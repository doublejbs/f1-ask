# 31. 날씨 전환 신호 (B3)

## 배경

비가 시작되거나 트랙이 마르면 타이어·전략이 통째로 바뀐다(슬릭 ↔ 인터 ↔ 웨트). 세컨드
스크린이 놓치면 안 되는 순간이다. 드라이버별 "지금 볼 것"(A~F, docs/19)과 달리 **세션 전체
사건**이라 크게 배너로 알린다.

## 설계

- **감지원**: `WeatherState.rainfall`(불리언)이 뒤집히는 것. dry→wet = 비 시작, wet→dry = 건조.
- **결정론적 코어**: `detectWeatherTransition(prev, curr)` 순수 함수 + `WeatherTransitionTracker`
  (프레임 간 상태 — 이전 rainfall·마지막 전환·세션 리셋). LLM 을 쓰지 않는다.
- **노출 창**: 전환 후 `DEFAULT_WEATHER_TRANSITION_WINDOW_LAPS`(3랩) 동안 배너 유지, 이후 조용.
  랩을 모르면 계속 노출한다.
- **세션 리셋**: 세션이 바뀌면 이전 날씨 기억을 버려 첫 프레임 오발화를 막는다.
- **UI**: `WeatherTransitionBannerView` — 종류별 색·아이콘(비=청록 CloudRain / 건조=앰버 Sun)
  + "전략 급변" 부문구. 날씨 칩 위에 둔다. 세션 사건이라 드라이버 탭 대상이 아니다.
- **훅**: `useWeatherTransition(snapshot)` — 트래커를 ref 로 유지(WatchNow 패턴).

## 범위 밖 (이후)

- 인터/웨트 세분(현재 rainfall 불리언만) · 강수 강도 추세.
- 워커 이벤트/AI 컨텍스트 적재(현재 클라이언트 배너만).
- 플리커 디바운스(현재 노출 창이 흡수).

## 수용 기준

1. rainfall 이 뒤집히면 종류(비 시작/건조)를 결정론으로 감지한다. 도메인 테스트로 고정.
2. 전환 후 창(3랩) 동안 배너가 뜨고 이후 사라진다. 세션 전환 시 오발화하지 않는다.
3. i18n en/ko/ja. mock·replay(드라이)에서는 전환이 없어 배너가 뜨지 않는다(정상).
