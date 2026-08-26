// 라이브 스냅샷의 circuit_short_name → 그랑프리 표시명 (docs 계획 §Phase 4).
//
// 라이브 스냅샷엔 meeting_name(그랑프리명)이 없고 circuitName(=circuit_short_name)만 있다.
// OpenF1 meetings 의 meeting_name 을 서킷별로 굳혀 매핑한다. 프리시즌 테스트 등 명백한
// 프로비저널 오류는 실제 그랑프리명으로 바로잡았다. 없는 서킷은 서킷명으로 폴백한다.
const GRAND_PRIX_BY_CIRCUIT: Record<string, string> = {
  Sakhir: "Bahrain Grand Prix",
  Melbourne: "Australian Grand Prix",
  Shanghai: "Chinese Grand Prix",
  Suzuka: "Japanese Grand Prix",
  Jeddah: "Saudi Arabian Grand Prix",
  Miami: "Miami Grand Prix",
  Montreal: "Canadian Grand Prix",
  "Monte Carlo": "Monaco Grand Prix",
  Catalunya: "Barcelona Grand Prix",
  Madring: "Spanish Grand Prix",
  Spielberg: "Austrian Grand Prix",
  Silverstone: "British Grand Prix",
  "Spa-Francorchamps": "Belgian Grand Prix",
  Hungaroring: "Hungarian Grand Prix",
  Zandvoort: "Dutch Grand Prix",
  Monza: "Italian Grand Prix",
  Baku: "Azerbaijan Grand Prix",
  Singapore: "Singapore Grand Prix",
  Austin: "United States Grand Prix",
  "Mexico City": "Mexico City Grand Prix",
  Interlagos: "São Paulo Grand Prix",
  "Las Vegas": "Las Vegas Grand Prix",
  Lusail: "Qatar Grand Prix",
  "Yas Marina Circuit": "Abu Dhabi Grand Prix",
};

// 서킷명으로 그랑프리 표시명을 낸다. 매핑 없으면 서킷명 그대로(라이브에서도 정보가 된다).
export const grandPrixTitle = (circuitShortName: string): string =>
  GRAND_PRIX_BY_CIRCUIT[circuitShortName] ?? circuitShortName;
