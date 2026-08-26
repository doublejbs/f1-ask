import { SupportedLocale } from "./SupportedLocale";

// 라이브 스냅샷의 circuit_short_name → 그랑프리 표시명(로케일별) (docs 계획 §Phase 4, B1).
//
// 라이브 스냅샷엔 meeting_name 이 없고 circuitName(=circuit_short_name)만 있다. OpenF1 meetings
// 의 meeting_name 을 서킷별로 굳혀 매핑하고, ko/ja 표시명을 함께 둔다. 프리시즌 테스트 등
// 명백한 프로비저널 오류는 실제 그랑프리명으로 바로잡았다. 없는 서킷은 서킷명으로 폴백한다.
type LocalizedName = Record<SupportedLocale, string>;

const gp = (en: string, ko: string, ja: string): LocalizedName => ({
  en,
  ko,
  ja,
});

const GRAND_PRIX_BY_CIRCUIT: Record<string, LocalizedName> = {
  Sakhir: gp("Bahrain Grand Prix", "바레인 그랑프리", "バーレーンGP"),
  Melbourne: gp("Australian Grand Prix", "호주 그랑프리", "オーストラリアGP"),
  Shanghai: gp("Chinese Grand Prix", "중국 그랑프리", "中国GP"),
  Suzuka: gp("Japanese Grand Prix", "일본 그랑프리", "日本GP"),
  Jeddah: gp("Saudi Arabian Grand Prix", "사우디아라비아 그랑프리", "サウジアラビアGP"),
  Miami: gp("Miami Grand Prix", "마이애미 그랑프리", "マイアミGP"),
  Montreal: gp("Canadian Grand Prix", "캐나다 그랑프리", "カナダGP"),
  "Monte Carlo": gp("Monaco Grand Prix", "모나코 그랑프리", "モナコGP"),
  Catalunya: gp("Barcelona Grand Prix", "바르셀로나 그랑프리", "バルセロナGP"),
  Madring: gp("Spanish Grand Prix", "스페인 그랑프리", "スペインGP"),
  Spielberg: gp("Austrian Grand Prix", "오스트리아 그랑프리", "オーストリアGP"),
  Silverstone: gp("British Grand Prix", "영국 그랑프리", "イギリスGP"),
  "Spa-Francorchamps": gp("Belgian Grand Prix", "벨기에 그랑프리", "ベルギーGP"),
  Hungaroring: gp("Hungarian Grand Prix", "헝가리 그랑프리", "ハンガリーGP"),
  Zandvoort: gp("Dutch Grand Prix", "네덜란드 그랑프리", "オランダGP"),
  Monza: gp("Italian Grand Prix", "이탈리아 그랑프리", "イタリアGP"),
  Baku: gp("Azerbaijan Grand Prix", "아제르바이잔 그랑프리", "アゼルバイジャンGP"),
  Singapore: gp("Singapore Grand Prix", "싱가포르 그랑프리", "シンガポールGP"),
  Austin: gp("United States Grand Prix", "미국 그랑프리", "アメリカGP"),
  "Mexico City": gp("Mexico City Grand Prix", "멕시코시티 그랑프리", "メキシコシティGP"),
  Interlagos: gp("São Paulo Grand Prix", "상파울루 그랑프리", "サンパウロGP"),
  "Las Vegas": gp("Las Vegas Grand Prix", "라스베이거스 그랑프리", "ラスベガスGP"),
  Lusail: gp("Qatar Grand Prix", "카타르 그랑프리", "カタールGP"),
  "Yas Marina Circuit": gp("Abu Dhabi Grand Prix", "아부다비 그랑프리", "アブダビGP"),
};

// 서킷명 + 로케일로 그랑프리 표시명을 낸다. 매핑 없으면 서킷명 그대로(라이브에서도 정보가 된다).
export const grandPrixTitle = (
  circuitShortName: string,
  locale: SupportedLocale,
): string =>
  GRAND_PRIX_BY_CIRCUIT[circuitShortName]?.[locale] ?? circuitShortName;
