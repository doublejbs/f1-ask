// 서킷별 예정 레이스 랩 수 (OpenF1 circuit_short_name 기준).
// OpenF1 은 라이브 중 총 랩을 제공하지 않으므로, F1 규정상 고정된 레이스 거리를
// 참조 테이블로 둔다. 방송 타이밍이 표시하는 "예정" 랩 수와 일치한다.
// (레드플래그로 단축된 레이스는 실제 완주 랩이 이보다 적을 수 있으나, 방송상
//  표시 기준은 예정 랩 수다.)
const RACE_LAPS_BY_CIRCUIT: Record<string, number> = {
  sakhir: 57,
  jeddah: 50,
  melbourne: 58,
  suzuka: 53,
  shanghai: 56,
  miami: 57,
  imola: 63,
  "monte carlo": 78,
  monaco: 78,
  catalunya: 66,
  barcelona: 66,
  montreal: 70,
  montréal: 70,
  spielberg: 71,
  "red bull ring": 71,
  silverstone: 52,
  "spa-francorchamps": 44,
  spa: 44,
  hungaroring: 70,
  zandvoort: 72,
  monza: 53,
  baku: 51,
  "marina bay": 62,
  singapore: 62,
  austin: 56,
  cota: 56,
  "mexico city": 71,
  interlagos: 71,
  "são paulo": 71,
  "sao paulo": 71,
  "las vegas": 50,
  lusail: 57,
  "yas marina": 58,
};

// Race 세션의 예정 총 랩 수. 알 수 없는 서킷이면 null.
//
// 입력이 nullable 인 이유: 두 값 모두 OpenF1 sessions 응답(circuit_short_name / session_type)에서
// 그대로 흘러온다. 타입은 non-null 이지만 외부 API 가 실제로 null 을 준 전례가 있다
// (어제 헝가리 GP 장애: stints.compound 를 `string` 으로 믿고 toUpperCase 를 불러 워커가
// 랩 40 부터 종료까지 약 30 분 정지). 이 함수는 정규화 경로 한복판(normalizeOpenF1SnapshotAt)에서
// 매 폴링 호출되므로 같은 사고가 나면 똑같이 워커 전체가 멈춘다.
export const scheduledRaceLaps = (
  circuitShortName: string | null | undefined,
  sessionType: string | null | undefined,
): number | null => {
  if (
    circuitShortName === null ||
    circuitShortName === undefined ||
    sessionType === null ||
    sessionType === undefined
  ) {
    return null;
  }

  if (sessionType.toLowerCase() !== "race") {
    return null;
  }

  const key = circuitShortName.trim().toLowerCase();

  return RACE_LAPS_BY_CIRCUIT[key] ?? null;
};
