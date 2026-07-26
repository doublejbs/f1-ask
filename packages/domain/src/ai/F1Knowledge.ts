// 큐레이션 F1 지식 (docs/26-question-agent.md §C 규정·상식).
//
// **이 파일은 신뢰 경계가 다르다 (docs/26 R5).** A·B 유형(이벤트·텔레메트리)은 결정론적
// 산수라 조회 자체가 환각을 막지만, 여기 있는 것은 **사람이 편집한 정적 텍스트**다 —
// 저자가 틀리면 오류가 "지식"으로 세탁돼 LLM 답변으로 나간다. 그래서 규칙은 두 가지다:
//
//   1. **모든 항목에 source 필수.** 어디서 온 사실인지 적지 못하면 넣지 않는다
//      (F1Knowledge.test.ts 가 빈 source 를 실패로 강제한다)
//   2. **확실하지 않으면 넣지 않는다.** 항목이 적은 것이 틀린 항목이 있는 것보다 낫다.
//      특히 해마다 바뀌는 값(랩 수·기록·의무 컴파운드 수 등)은 넣지 않는다 — 경기
//      데이터가 이미 준다. 조회 결과가 없으면 모델은 "모른다"고 답한다(툴 description 규칙)
//
// 규칙 2 의 구체적 적용 두 가지 (사실성 리뷰에서 실제로 걸린 것들):
//
//   - **코너 방향(좌/우)은 쓰지 않는다.** 서킷 항목의 출처는 "일반 상식(안정적)" 인데,
//     방향은 그 안정적 층이 보증하지 못하는 디테일이다(실제로 Raidillon 을 좌코너로 적은
//     오류가 있었다). 코너는 이름·성격(오르막·저속·브레이킹존)으로만 서술한다
//   - **최상급("the fastest ... on the calendar")은 쓰지 않는다.** 캘린더 구성에 따라
//     해마다 바뀐다. "very high average speed" 처럼 등급 없는 서술로 낮춘다
//
// source 라벨도 근거를 **승격시키지 않는다**. 레포가 실데이터로 확인한 부분과 문서 저자의
// 규정 서술이 한 블록에 섞여 있으면 라벨에서 둘을 갈라 적는다(overtake_mode 참고).
//
// body 는 영어다 — 시스템 프롬프트·툴 정의와 언어를 맞춰 모델이 그대로 인용하게 한다.
// 답변 언어는 provider 의 "Respond in ..." 규칙이 따로 정한다.

export type F1KnowledgeEntry = {
  // 조회 키. snake_case, 서킷은 CIRCUIT_TOPIC_PREFIX 를 붙인다.
  topic: string;
  title: string;
  // LLM 이 인용할 사실 문장.
  body: string;
  // 출처 — 필수. 레포 내 근거는 "파일:줄", 그 외는 "일반 상식(안정적)".
  source: string;
  // 추가 조회 키. **사실 주장이 아니라 조회 키일 뿐이라 출처를 요구하지 않는다** —
  // topic 은 이 앱의 내부 표기("overtake_mode")인데 사용자·모델은 자연어("DRS")로 묻는다.
  // 별칭이 없으면 검증된 답을 갖고도 빈 배열을 돌려주고 모델은 "모른다"고 답한다.
  aliases?: string[];
};

// 서킷 항목 접두사. 세션 메타(LiveRaceSnapshot.circuitName)로 해당 서킷만 골라 싣는다.
export const CIRCUIT_TOPIC_PREFIX = "circuit:";

export const F1_KNOWLEDGE: F1KnowledgeEntry[] = [
  {
    topic: "overtake_mode",
    title: "Overtake mode (manual override), and the end of DRS",
    body: [
      "From the 2026 season DRS no longer exists.",
      "Race control still sends OVERTAKE ENABLED / OVERTAKE DISABLED messages, and they now mark the window in which the manual override is available.",
      "Manual override is an extra burst of electrical power given to a chasing car that is within one second of the car ahead, so it fills the role DRS used to play.",
      'This app shows it as "overtake mode" (Korean UI: 오버테이크 모드), and the overtake_mode_enabled / overtake_mode_disabled events in the feed are exactly those race-control messages.',
    ].join(" "),
    // 라벨을 근거보다 세게 적지 않는다: 이 블록에서 레포가 실데이터로 확인한 것은
    // "OpenF1 이 OVERTAKE ENABLED/DISABLED 문구를 보낸다" 뿐이고, DRS 폐지·매뉴얼
    // 오버라이드는 문서 저자가 적은 규정 서술이다. 둘을 갈라 표기한다.
    source:
      "docs/10-race-events.md:145-148 (문구는 실데이터 확인 · 규정 해석은 문서 서술)",
    // "DRS 어디 갔어?" 가 2026 에 가장 나올 법한 질문이다. topic 은 overtake_mode 라
    // 별칭이 없으면 이 검증된 항목에 닿지 못한다.
    aliases: ["drs", "manual override", "overtake button"],
  },
  {
    topic: "points",
    title: "Championship points for a grand prix",
    body: [
      "A grand prix awards championship points to the top ten finishers:",
      "P1 25, P2 18, P3 15, P4 12, P5 10, P6 8, P7 6, P8 4, P9 2, P10 1.",
      "Finishing eleventh or lower scores zero.",
      // 스프린트 스케일은 출처가 없어 싣지 않는다(규칙 2). 다만 침묵하면 모델이 GP
      // 스케일을 스프린트에 그대로 물리므로, **적용 범위**를 명시해 오적용을 막는다.
      "This is the grand prix scale; sprint races use a different scale not covered here.",
    ].join(" "),
    source: "packages/domain/src/watchnow/WatchNowChampionshipPoints.ts:10-12",
    aliases: ["championship points", "scoring", "points system"],
  },
  {
    topic: "tyre_compounds",
    title: "Tyre compound labels in the timing data",
    body: [
      "Timing data reports the tyre a driver is on as SOFT, MEDIUM or HARD for the dry compounds, INTERMEDIATE for a damp track and WET for heavy rain (UNKNOWN when the feed has not said yet).",
      "SOFT / MEDIUM / HARD are relative labels for the three dry compounds nominated for that event, not fixed rubber.",
      "The softer the compound the more grip and the faster the lap time, but the sooner it wears out; the harder the compound, the longer a stint can be run on it.",
    ].join(" "),
    source:
      "packages/domain/src/TireCompound.ts:2-9 (표기 값) · 일반 상식(안정적) (소프트=빠르고 마모 빠름)",
    aliases: ["tire compounds", "tires", "tyres", "compounds"],
  },
  {
    topic: "safety_car",
    title: "Safety car",
    body: [
      "A safety car is deployed when an incident leaves the track unsafe at racing speed.",
      "The field has to slow down and line up behind it, overtaking is not allowed, and the gaps between the cars are closed up.",
      "Because everyone is running slowly, a pit stop taken while the safety car is out costs less time than the same stop under green-flag running, so a safety car often reshuffles strategy.",
    ].join(" "),
    source: "일반 상식(안정적)",
  },
  {
    topic: "virtual_safety_car",
    title: "Virtual safety car (VSC)",
    body: [
      "A virtual safety car neutralises the race without sending a physical car onto the track.",
      "Drivers must stay above a delta time shown on their dashboard, so the gaps between cars are broadly held instead of being closed up, and overtaking is not allowed.",
      "It is used for incidents that need the field slowed but not bunched together.",
    ].join(" "),
    source: "일반 상식(안정적)",
    aliases: ["vsc"],
  },
  {
    topic: "track_limits",
    title: "Track limits",
    body: [
      "The track is bounded by the white lines, and a driver who puts all four wheels beyond the white line has left the track.",
      "Race control monitors this, and repeated abuse can cost the driver a lap time or bring a penalty.",
      "The track_limits events in the feed are those race-control notes.",
    ].join(" "),
    source: "docs/10-race-events.md:132 (이벤트 타입) · 일반 상식(안정적) (네 바퀴 규정)",
  },
  {
    topic: `${CIRCUIT_TOPIC_PREFIX}spa-francorchamps`,
    title: "Spa-Francorchamps (Belgian Grand Prix)",
    body: [
      "Spa-Francorchamps, in the Ardennes forest in Belgium, is one of the longest and fastest circuits on the calendar.",
      // 코너 방향은 적지 않는다(파일 상단 규칙 2). 이름과 성격만으로도 답변에 필요한 것은 다 있다.
      "Its signature is the uphill Eau Rouge/Raidillon complex leading onto the long Kemmel straight; the braking zone at Les Combes at the end of that straight is the classic overtaking place, with the La Source hairpin and the final chicane the other main passing spots.",
      "The lap is long enough that it can be raining on one part of the circuit while another part stays dry, which makes weather and tyre calls unusually decisive here.",
    ].join(" "),
    source: "일반 상식(안정적)",
  },
  {
    topic: `${CIRCUIT_TOPIC_PREFIX}monza`,
    title: "Monza (Italian Grand Prix)",
    body: [
      // "the fastest on the calendar" 은 캘린더 구성에 따라 해마다 바뀌므로 쓰지 않는다.
      "Monza, in a royal park north of Milan, is nicknamed the Temple of Speed and is run at very high average speed.",
      "Teams run their lowest-downforce wings of the year: the lap is a chain of long straights broken by heavy braking into chicanes, plus the fast Curva Grande, Lesmo and Parabolica corners.",
      "Passes are made by slipstreaming down the straights into the braking zones at the first chicane and the Roggia chicane.",
    ].join(" "),
    source: "일반 상식(안정적)",
  },
];

// 조회 키 정규화. 대소문자·구분자(공백·하이픈·언더스코어·콜론)를 지워 비교한다 —
// 모델이 "overtake mode"·"Overtake_Mode"·"overtake-mode" 중 무엇을 보내도 같은 항목에
// 닿게 하려는 것이다. 서킷 이름도 같은 함수로 정규화한다("Spa-Francorchamps" →
// "spafrancorchamps").
const normalizeKey = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

// 부분 일치 최소 길이. 2글자 이하 질의는 아무 항목에나 걸려 소음이 되므로 정확 일치만 본다.
const MIN_PARTIAL_MATCH_LENGTH = 3;

const isCircuitEntry = (entry: F1KnowledgeEntry): boolean =>
  entry.topic.startsWith(CIRCUIT_TOPIC_PREFIX);

// 항목의 대표 매칭 키.
//
// 서킷 항목은 **접두사를 뺀 이름**으로만 매칭한다. 접두사까지 넣으면 topic="circuit" 한
// 단어에 모든 서킷이 걸려, 이 세션과 무관한 서킷 정보가 답변에 섞인다. 현재 세션의 서킷은
// circuitName 인자로 따로 들어오므로 그 경로만 남기는 것이 안전하다.
const toMatchKey = (entry: F1KnowledgeEntry): string => {
  if (isCircuitEntry(entry)) {
    return normalizeKey(entry.topic.slice(CIRCUIT_TOPIC_PREFIX.length));
  }

  return normalizeKey(entry.topic);
};

// 대표 키 + 별칭. 별칭은 조회 키일 뿐이므로 대표 키와 같은 규칙으로 정규화해 나란히 쓴다.
const toMatchKeys = (entry: F1KnowledgeEntry): string[] => [
  toMatchKey(entry),
  ...(entry.aliases ?? []).map(normalizeKey),
];

// 정확 일치는 전체 topic("circuit:spa-francorchamps")·이름만("spa-francorchamps")·별칭("drs")
// 을 모두 받는다.
const matchesExactly = (entry: F1KnowledgeEntry, queryKey: string): boolean =>
  queryKey === normalizeKey(entry.topic) ||
  toMatchKeys(entry).includes(queryKey);

// 부분 일치는 양방향이다. 모델이 "points" 처럼 짧게 보내기도 하고
// "what is the overtake mode" 처럼 문장으로 보내기도 하기 때문이다.
//
// **길이 가드도 양방향이다.** queryKey 뿐 아니라 entryKey 도 검사한다 — 지금은 두 글자짜리
// 키가 없지만, 나중에 짧은 topic·별칭이 하나 들어오는 순간 그 키가 모든 긴 질의에 걸려
// 무관한 항목이 답변에 섞인다.
const matchesPartially = (
  entry: F1KnowledgeEntry,
  queryKey: string,
): boolean => {
  if (queryKey.length < MIN_PARTIAL_MATCH_LENGTH) {
    return false;
  }

  return toMatchKeys(entry).some((entryKey) => {
    if (entryKey.length < MIN_PARTIAL_MATCH_LENGTH) {
      return false;
    }

    return entryKey.includes(queryKey) || queryKey.includes(entryKey);
  });
};

// topic 매칭. 정확 일치가 하나라도 있으면 그것만 준다 — 부분 일치의 소음을 덮어쓴다.
const findByTopic = (queryKey: string): F1KnowledgeEntry[] => {
  if (queryKey.length === 0) {
    return [];
  }

  const exact = F1_KNOWLEDGE.filter((entry) => matchesExactly(entry, queryKey));

  if (exact.length > 0) {
    return exact;
  }

  return F1_KNOWLEDGE.filter((entry) => matchesPartially(entry, queryKey));
};

// 서킷/코스 질의를 알아보는 키워드. 정규화된 queryKey 에 대해 부분 문자열로 본다.
const CIRCUIT_QUERY_KEYWORDS = [
  "circuit",
  "track",
  "course",
  "corner",
  "layout",
  "straight",
  "chicane",
  "sector",
];

// 세션 서킷 항목을 덧붙일지 판단한다.
//
// 예전에는 circuitName 이 있으면 **무조건** 덧붙였다. 그러면 "포인트 어떻게 매겨져?" 에
// Spa 설명이 딸려 나오고, 한글 질문("세이프티카가 뭐야")은 정규화가 ASCII 만 남겨 queryKey
// 가 "" 가 되므로 서킷 설명 하나만 돌아온다 — 질문과 무관한 답의 재료가 된다. 그래서:
//
//   - topic 인자 자체가 비었으면 덧붙인다. 호출자가 "이 세션의 서킷을 달라"고 한 것이다
//     (executor 가 topic 없는 툴 호출을 이 형태로 넘긴다)
//   - topic 은 있는데 정규화 결과가 비면(비-ASCII) 덧붙이지 않는다 — 무슨 질문인지 모르는
//     상태에서 서킷 설명을 끼워 넣는 것이 가장 나쁜 경우다
//   - topic 이 이미 서킷 아닌 항목을 잡았으면 규정 질문이므로 덧붙이지 않는다
//   - 그 외에는 서킷/코스 질의일 때만 덧붙인다("this circuit" 처럼 서킷 이름 없이 묻는 경우)
const shouldAttachCircuitEntry = (
  topic: string,
  queryKey: string,
  matched: F1KnowledgeEntry[],
): boolean => {
  if (topic.trim().length === 0) {
    return true;
  }

  if (queryKey.length === 0) {
    return false;
  }

  if (matched.some((entry) => !isCircuitEntry(entry))) {
    return false;
  }

  return CIRCUIT_QUERY_KEYWORDS.some((keyword) => queryKey.includes(keyword));
};

// 큐레이션 지식 조회 — 순수 함수(F1_KNOWLEDGE 를 mutate 하지 않는다).
//
// 규칙:
//   - topic: 정확 일치가 하나라도 있으면 그것만, 없으면 부분 일치를 준다
//   - circuitName: 서킷 질문("이 코스 특징?")은 서킷 이름을 말하지 않는 경우가 대부분이라
//     (세션이 곧 맥락) 세션 메타로 싣는다. 단 아무 질문에나 붙이지는 않는다
//     — shouldAttachCircuitEntry 참고
//   - 일치가 없으면 빈 배열. 빈 배열이면 모델은 "모른다"고 답해야 한다(툴 description 규칙) —
//     지식을 지어내지 않게 하는 것이 이 툴의 존재 이유다
export const lookupF1Knowledge = (
  topic: string,
  circuitName?: string,
): F1KnowledgeEntry[] => {
  const queryKey = normalizeKey(topic);
  const results = [...findByTopic(queryKey)];

  if (
    circuitName !== undefined &&
    shouldAttachCircuitEntry(topic, queryKey, results)
  ) {
    const circuitKey = normalizeKey(circuitName);
    const circuitEntry = F1_KNOWLEDGE.find(
      (entry) => isCircuitEntry(entry) && toMatchKey(entry) === circuitKey,
    );

    // 이미 topic 으로 잡혔으면 중복으로 싣지 않는다.
    if (circuitEntry !== undefined && !results.includes(circuitEntry)) {
      results.push(circuitEntry);
    }
  }

  return results;
};
