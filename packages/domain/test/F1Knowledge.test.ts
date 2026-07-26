import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CIRCUIT_TOPIC_PREFIX,
  F1KnowledgeEntry,
  F1_KNOWLEDGE,
  lookupF1Knowledge,
} from "../src/ai/F1Knowledge";
import {
  LOOKUP_F1_KNOWLEDGE_TOOL_NAME,
  QUERY_DRIVER_EVENTS_TOOL_NAME,
  QUESTION_TOOL_DEFINITIONS,
  createQuestionToolExecutor,
} from "../src/ai/QuestionTools";
import { DriverEventResult } from "../src/ai/QueryDriverEvents";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";

const makeEvent = (fields: {
  id: string;
  type: RaceEventType;
  driverNumber?: number;
  lapNumber?: number;
}): RaceEvent => ({
  schemaVersion: 1,
  id: fields.id,
  sessionId: "session-belgium",
  type: fields.type,
  priority: RaceEventPriority.Medium,
  ...(fields.driverNumber === undefined
    ? {}
    : { driverNumber: fields.driverNumber }),
  ...(fields.lapNumber === undefined ? {} : { lapNumber: fields.lapNumber }),
  timestamp: "2026-07-19T05:10:00.000Z",
  params: {},
  deduplicationKey: fields.id,
});

const EVENTS: RaceEvent[] = [
  makeEvent({
    id: "pit-44-lap5",
    type: RaceEventType.PitStop,
    driverNumber: 44,
    lapNumber: 5,
  }),
];

const topicsOf = (entries: F1KnowledgeEntry[]): string[] =>
  entries.map((entry) => entry.topic);

// ── 출처 앵커 검증 도구 ────────────────────────────────────────────────────────
//
// source 가 "비어있지 않은지"만 보는 검사는 형식 검사다 — 인용한 파일이 지워지거나 그 줄이
// 딴 것을 가리키게 돼도 통과하고, 출처가 있다는 **착시**만 남는다. R5 의 실질 방어선은
// 인용이 지금도 참인지 확인하는 것이므로 여기서 두 가지를 본다:
//
//   1. 인용한 레포 파일이 실재하는가
//   2. 그 사실의 **앵커 문자열**이 인용 줄 근처에 있는가
//
// 줄 번호가 아니라 앵커로 잡는 이유는 리팩터링으로 줄이 쉽게 밀리기 때문이다 — 줄이 조금
// 움직이는 것은 통과시키고, 근거 자체가 사라지면 실패시킨다.
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "../../..");

// 인용 줄에서 허용할 오차(줄). 밀린 줄은 봐주되 같은 파일의 무관한 블록은 봐주지 않는다.
const ANCHOR_LINE_TOLERANCE = 25;

// source 안의 "경로:줄" 또는 "경로:줄-줄". 한 source 에 여러 개가 올 수 있다.
const SOURCE_REFERENCE_PATTERN = /([\w./-]+\.(?:ts|tsx|md)):(\d+)(?:-(\d+))?/g;

type SourceReference = { path: string; fromLine: number; toLine: number };

const parseSourceReferences = (source: string): SourceReference[] => {
  const references: SourceReference[] = [];

  for (const match of source.matchAll(SOURCE_REFERENCE_PATTERN)) {
    const fromLine = Number(match[2]);

    references.push({
      path: match[1]!,
      fromLine,
      toLine: match[3] === undefined ? fromLine : Number(match[3]),
    });
  }

  return references;
};

// 항목별 앵커 — "이 사실이 정말 그 파일에 있는가"를 문자열 하나로 못 박는다.
// 레포 파일을 인용하는 항목을 새로 넣으면 여기에도 앵커를 등록해야 테스트가 통과한다.
const SOURCE_ANCHORS: Record<string, string> = {
  overtake_mode: "매뉴얼 오버라이드",
  points: "25, 18, 15",
  tyre_compounds: "INTERMEDIATE",
  track_limits: "TRACK LIMITS",
};

const entriesCitingRepoFiles = (): {
  entry: F1KnowledgeEntry;
  references: SourceReference[];
}[] =>
  F1_KNOWLEDGE.map((entry) => ({
    entry,
    references: parseSourceReferences(entry.source),
  })).filter((item) => item.references.length > 0);

// 앵커가 인용 줄 ± 오차 범위 안에 있는 첫 줄 번호(1-based). 없으면 undefined.
const findAnchorLine = (
  reference: SourceReference,
  anchor: string,
): number | undefined => {
  const lines = readFileSync(join(REPO_ROOT, reference.path), "utf8").split(
    "\n",
  );

  for (const [index, line] of lines.entries()) {
    if (!line.includes(anchor)) {
      continue;
    }

    const lineNumber = index + 1;

    if (
      lineNumber >= reference.fromLine - ANCHOR_LINE_TOLERANCE &&
      lineNumber <= reference.toLine + ANCHOR_LINE_TOLERANCE
    ) {
      return lineNumber;
    }
  }

  return undefined;
};

// 이 describe 가 docs/26 수용 기준 6(R5) 의 방어선이다. 지식은 결정론이 지켜주지 않으므로,
// **출처 없는 항목이 하나라도 들어오면 빌드가 깨져야 한다.**
describe("F1_KNOWLEDGE 출처 강제", () => {
  it("모든 항목이 비어있지 않은 source 를 갖는다", () => {
    expect(F1_KNOWLEDGE.length).toBeGreaterThan(0);

    for (const entry of F1_KNOWLEDGE) {
      expect(entry.source.trim(), `source 누락: ${entry.topic}`).not.toBe("");
    }
  });

  it("모든 항목이 topic·title·body 를 채운다", () => {
    for (const entry of F1_KNOWLEDGE) {
      expect(entry.topic.trim()).not.toBe("");
      expect(entry.title.trim()).not.toBe("");
      expect(entry.body.trim()).not.toBe("");
    }
  });

  it("topic 이 중복되지 않는다", () => {
    const topics = topicsOf(F1_KNOWLEDGE);

    expect(new Set(topics).size).toBe(topics.length);
  });

  it("검증된 레포 사실은 레포 출처를 인용한다", () => {
    const overtakeMode = F1_KNOWLEDGE.find(
      (entry) => entry.topic === "overtake_mode",
    );
    const points = F1_KNOWLEDGE.find((entry) => entry.topic === "points");

    expect(overtakeMode?.source).toContain("docs/10-race-events.md");
    expect(points?.source).toContain("WatchNowChampionshipPoints.ts");
  });

  it("overtake_mode 출처가 실데이터 확인과 문서 서술을 갈라 적는다", () => {
    // 이 블록에서 실데이터로 확인된 것은 OVERTAKE ENABLED/DISABLED 문구뿐이고, DRS 폐지·
    // 매뉴얼 오버라이드는 문서 저자의 규정 서술이다. 라벨이 후자를 "실데이터 확인"으로
    // 승격시키면 근거가 한 단계 부풀려진다.
    const overtakeMode = F1_KNOWLEDGE.find(
      (entry) => entry.topic === "overtake_mode",
    );

    expect(overtakeMode?.source).toContain("문구는 실데이터 확인");
    expect(overtakeMode?.source).toContain("규정 해석은 문서 서술");
    expect(overtakeMode?.source).not.toContain("이 레포가 실데이터로 확인한 사실");
  });
});

describe("F1_KNOWLEDGE 출처 앵커 검증", () => {
  it("레포 파일을 인용한 항목이 하나 이상 있다", () => {
    // 이 describe 가 무의미하게 통과하는(인용 항목 0개) 상태를 막는다.
    expect(entriesCitingRepoFiles().length).toBeGreaterThan(0);
  });

  it("인용한 레포 파일이 실재한다", () => {
    for (const { entry, references } of entriesCitingRepoFiles()) {
      for (const reference of references) {
        expect(
          existsSync(join(REPO_ROOT, reference.path)),
          `${entry.topic} 의 출처 파일이 없다: ${reference.path}`,
        ).toBe(true);
      }
    }
  });

  it("레포 파일을 인용한 항목은 앵커를 등록한다", () => {
    for (const { entry } of entriesCitingRepoFiles()) {
      expect(
        SOURCE_ANCHORS[entry.topic],
        `${entry.topic} 의 앵커가 SOURCE_ANCHORS 에 없다`,
      ).toBeDefined();
    }
  });

  it("앵커 문자열이 인용 줄 근처에 실제로 있다", () => {
    for (const { entry, references } of entriesCitingRepoFiles()) {
      const anchor = SOURCE_ANCHORS[entry.topic]!;
      const anchorLines = references.map((reference) =>
        findAnchorLine(reference, anchor),
      );

      expect(
        anchorLines.some((line) => line !== undefined),
        `${entry.topic} 의 앵커 "${anchor}" 를 인용 줄 근처에서 찾지 못했다: ${entry.source}`,
      ).toBe(true);
    }
  });

  it("존재하지 않는 앵커는 잡아낸다", () => {
    // 검증기 자체가 무엇이든 통과시키는 상태(항상 참)를 막는 대조군이다.
    const first = entriesCitingRepoFiles()[0]!;

    expect(
      findAnchorLine(first.references[0]!, "이 문자열은 레포에 없다"),
    ).toBeUndefined();
  });

  it("문서 앞부분 텍스트는 뒷부분의 인용 줄에서 찾지 못한다", () => {
    // 허용오차 검증기가 실제로 거리를 보는지 확인하는 대조군이다.
    // docs/10-race-events.md 의 앞부분(~5행)에만 있는 "Firestore"를
    // 145-148 범위로 조회하면 ±25줄 허용오차를 벗어나 검출되지 않아야 한다.
    // 왜냐하면: 145 - 25 = 120이고, "Firestore"는 5행에만 있기 때문
    const reference: SourceReference = {
      path: "docs/10-race-events.md",
      fromLine: 145,
      toLine: 148,
    };

    expect(findAnchorLine(reference, "Firestore")).toBeUndefined();
  });
});

// 사실성 리뷰가 실제로 잡아낸 오류들을 회귀로 고정한다. 지식 파일은 결정론이 지켜주지
// 않으므로, 한 번 틀린 종류의 서술은 테스트로 막아 두는 것이 유일한 재발 방지책이다.
describe("F1_KNOWLEDGE 본문 사실성", () => {
  it("오버테이크 모드 항목이 2026 DRS 폐지와 매뉴얼 오버라이드를 담는다", () => {
    const [entry] = lookupF1Knowledge("overtake_mode");

    expect(entry?.body).toContain("2026");
    expect(entry?.body).toContain("DRS");
    expect(entry?.body).toContain("manual override");
  });

  it("포인트 항목이 25/18/15 배분을 담는다", () => {
    const [entry] = lookupF1Knowledge("points");

    expect(entry?.body).toContain("P1 25");
    expect(entry?.body).toContain("P2 18");
    expect(entry?.body).toContain("P3 15");
    expect(entry?.body).toContain("P10 1");
  });

  it("포인트 항목이 GP 스케일임을 밝혀 스프린트 오적용을 막는다", () => {
    // 스프린트 스케일 자체는 출처가 없어 싣지 않는다. 대신 적용 범위를 명시해 모델이
    // GP 스케일을 스프린트에 그대로 물리는 것을 막는다.
    const [entry] = lookupF1Knowledge("points");

    expect(entry?.body).toContain("grand prix scale");
    expect(entry?.body).toContain("sprint races use a different scale");
  });

  it("서킷 항목이 코너 방향을 주장하지 않는다", () => {
    // Raidillon 을 좌코너로 적은 오류가 실제로 있었다. 방향은 이 항목들의 출처
    // ("일반 상식(안정적)")가 보증하지 못하는 디테일이라 아예 쓰지 않는다.
    const circuitEntries = F1_KNOWLEDGE.filter((entry) =>
      entry.topic.startsWith(CIRCUIT_TOPIC_PREFIX),
    );

    expect(circuitEntries.length).toBeGreaterThan(0);

    for (const entry of circuitEntries) {
      expect(
        /\b(?:left|right)-?(?:hand(?:er)?)?\b/i.test(entry.body),
        `${entry.topic} 본문에 코너 방향 서술이 있다`,
      ).toBe(false);
    }
  });

  it("서킷 항목이 캘린더 의존 최상급을 쓰지 않는다", () => {
    // "the fastest circuit on the calendar" 은 캘린더 구성에 따라 해마다 바뀐다.
    const monza = F1_KNOWLEDGE.find(
      (entry) => entry.topic === `${CIRCUIT_TOPIC_PREFIX}monza`,
    );

    expect(monza?.body).not.toContain("the fastest circuit on the calendar");
    expect(monza?.body).toContain("Temple of Speed");
  });
});

describe("lookupF1Knowledge 토픽 조회", () => {
  it("정확한 토픽을 찾는다", () => {
    expect(topicsOf(lookupF1Knowledge("safety_car"))).toEqual(["safety_car"]);
  });

  it("구분자·대소문자가 달라도 같은 항목에 닿는다", () => {
    expect(topicsOf(lookupF1Knowledge("Overtake Mode"))).toEqual([
      "overtake_mode",
    ]);
    expect(topicsOf(lookupF1Knowledge("overtake-mode"))).toEqual([
      "overtake_mode",
    ]);
  });

  it("문장으로 물어도 부분 일치로 찾는다", () => {
    expect(topicsOf(lookupF1Knowledge("what is the overtake mode?"))).toEqual([
      "overtake_mode",
    ]);
  });

  it("정확 일치가 있으면 부분 일치의 소음을 섞지 않는다", () => {
    // "safety_car" 는 "virtual_safety_car" 의 부분 문자열이지만 정확 일치가 우선한다.
    expect(topicsOf(lookupF1Knowledge("safety_car"))).not.toContain(
      "virtual_safety_car",
    );
  });

  it("모르는 토픽은 빈 배열이다", () => {
    expect(lookupF1Knowledge("engine mapping mode 7")).toEqual([]);
  });

  it("빈 토픽은 빈 배열이다", () => {
    expect(lookupF1Knowledge("")).toEqual([]);
    expect(lookupF1Knowledge("   ")).toEqual([]);
  });

  it("두 글자 이하 질의는 아무 항목에나 걸리지 않는다", () => {
    expect(lookupF1Knowledge("ca")).toEqual([]);
  });
});

// 별칭은 사실 주장이 아니라 조회 키다. 검증된 항목을 갖고도 사용자가 쓰는 말로는 못 찾아
// "모른다"고 답하는 것을 막는다 — 2026 에는 "DRS 어디 갔어?" 가 가장 흔한 질문이다.
describe("lookupF1Knowledge 별칭 조회", () => {
  it('"drs" 가 overtake_mode 에 닿는다', () => {
    expect(topicsOf(lookupF1Knowledge("drs"))).toEqual(["overtake_mode"]);
  });

  it("문장 속 DRS 도 overtake_mode 로 잡는다", () => {
    expect(topicsOf(lookupF1Knowledge("where did DRS go?"))).toEqual([
      "overtake_mode",
    ]);
  });

  it("타이어 표기 별칭이 tyre_compounds 에 닿는다", () => {
    expect(topicsOf(lookupF1Knowledge("tires"))).toEqual(["tyre_compounds"]);
    expect(topicsOf(lookupF1Knowledge("tire compounds"))).toEqual([
      "tyre_compounds",
    ]);
  });

  it('"vsc" 가 virtual_safety_car 에 닿는다', () => {
    expect(topicsOf(lookupF1Knowledge("vsc"))).toEqual(["virtual_safety_car"]);
  });

  it("별칭이 없는 항목은 여전히 topic 으로만 잡힌다", () => {
    expect(topicsOf(lookupF1Knowledge("safety_car"))).toEqual(["safety_car"]);
  });
});

describe("lookupF1Knowledge 서킷 매칭", () => {
  it("circuitName 으로 해당 서킷 항목을 싣는다", () => {
    expect(topicsOf(lookupF1Knowledge("", "spa-francorchamps"))).toEqual([
      `${CIRCUIT_TOPIC_PREFIX}spa-francorchamps`,
    ]);
  });

  it("OpenF1 표기(Spa-Francorchamps)도 정규화해 매칭한다", () => {
    const entries = lookupF1Knowledge("this circuit", "Spa-Francorchamps");

    expect(topicsOf(entries)).toEqual([
      `${CIRCUIT_TOPIC_PREFIX}spa-francorchamps`,
    ]);
  });

  it("서킷/코스 질의일 때 서킷 항목을 덧붙인다", () => {
    expect(
      topicsOf(lookupF1Knowledge("what are the corners like", "spa-francorchamps")),
    ).toEqual([`${CIRCUIT_TOPIC_PREFIX}spa-francorchamps`]);
  });

  it("규정 질문에는 서킷 항목을 덧붙이지 않는다", () => {
    // 예전에는 circuitName 만 있으면 무조건 붙어 "포인트 어떻게 매겨져?" 에 Spa 설명이
    // 딸려 나왔다. 질문과 무관한 지식은 답변을 흐린다.
    expect(topicsOf(lookupF1Knowledge("points", "spa-francorchamps"))).toEqual([
      "points",
    ]);
    expect(
      topicsOf(lookupF1Knowledge("safety_car", "spa-francorchamps")),
    ).toEqual(["safety_car"]);
  });

  it("정규화 결과가 빈 비-ASCII 질의에는 서킷 항목을 덧붙이지 않는다", () => {
    // 한글은 normalizeKey 가 통째로 지워 queryKey 가 "" 가 된다. 여기서 서킷 항목을 붙이면
    // "세이프티카가 뭐야" 가 Spa 설명으로 답해진다 — 무슨 질문인지 모를 때가 가장 위험하다.
    expect(lookupF1Knowledge("세이프티카가 뭐야", "spa-francorchamps")).toEqual(
      [],
    );
  });

  it("모르는 토픽이어도 서킷 질의가 아니면 서킷 항목을 붙이지 않는다", () => {
    expect(
      lookupF1Knowledge("engine mapping mode 7", "spa-francorchamps"),
    ).toEqual([]);
  });

  it("토픽이 이미 그 서킷을 잡았으면 중복으로 싣지 않는다", () => {
    const entries = lookupF1Knowledge("spa-francorchamps", "spa-francorchamps");

    expect(topicsOf(entries)).toEqual([
      `${CIRCUIT_TOPIC_PREFIX}spa-francorchamps`,
    ]);
  });

  it("지식이 없는 서킷이면 서킷 항목 없이 돌려준다", () => {
    expect(topicsOf(lookupF1Knowledge("points", "Yas Marina"))).toEqual([
      "points",
    ]);
    expect(lookupF1Knowledge("", "Yas Marina")).toEqual([]);
  });

  it('"circuit" 한 단어로 모든 서킷이 딸려오지 않는다', () => {
    // 세션과 무관한 서킷 정보가 답변에 섞이면 안 된다 — 현재 서킷은 circuitName 으로만 들어온다.
    expect(lookupF1Knowledge("circuit")).toEqual([]);
  });
});

describe("createQuestionToolExecutor 툴 이름 분기", () => {
  it("queryDriverEvents 를 이벤트 조회로 처리한다", async () => {
    const executor = createQuestionToolExecutor(EVENTS, "spa-francorchamps");

    const result = (await executor(QUERY_DRIVER_EVENTS_TOOL_NAME, {
      driverNumber: 44,
    })) as DriverEventResult[];

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe(RaceEventType.PitStop);
    expect(result[0]?.lapNumber).toBe(5);
  });

  it("lookupF1Knowledge 를 지식 조회로 처리한다", async () => {
    const executor = createQuestionToolExecutor(EVENTS, "spa-francorchamps");

    const result = (await executor(LOOKUP_F1_KNOWLEDGE_TOOL_NAME, {
      topic: "points",
    })) as F1KnowledgeEntry[];

    expect(topicsOf(result)).toEqual(["points"]);
  });

  it("한 executor 가 두 툴을 연달아 처리한다", async () => {
    const executor = createQuestionToolExecutor(EVENTS, "spa-francorchamps");

    const events = (await executor(
      QUERY_DRIVER_EVENTS_TOOL_NAME,
      {},
    )) as DriverEventResult[];
    const knowledge = (await executor(LOOKUP_F1_KNOWLEDGE_TOOL_NAME, {
      topic: "safety_car",
    })) as F1KnowledgeEntry[];

    expect(events).toHaveLength(1);
    expect(topicsOf(knowledge)).toContain("safety_car");
  });

  it("topic 인자가 없어도 크래시하지 않고 서킷 항목을 준다", async () => {
    const executor = createQuestionToolExecutor(EVENTS, "spa-francorchamps");

    const result = (await executor(
      LOOKUP_F1_KNOWLEDGE_TOOL_NAME,
      {},
    )) as F1KnowledgeEntry[];

    expect(topicsOf(result)).toEqual([
      `${CIRCUIT_TOPIC_PREFIX}spa-francorchamps`,
    ]);
  });

  it("circuitName 없이도 지식 조회가 동작한다", async () => {
    const executor = createQuestionToolExecutor(EVENTS);

    const result = (await executor(LOOKUP_F1_KNOWLEDGE_TOOL_NAME, {
      topic: "tyre_compounds",
    })) as F1KnowledgeEntry[];

    expect(topicsOf(result)).toEqual(["tyre_compounds"]);
  });

  it("모르는 툴 이름은 빈 결과로 흘려보낸다", async () => {
    const executor = createQuestionToolExecutor(EVENTS, "spa-francorchamps");

    expect(await executor("queryWeatherForecast", {})).toEqual([]);
  });
});

describe("QUESTION_TOOL_DEFINITIONS 지식 툴", () => {
  it("두 툴을 노출하고 이벤트 툴이 앞에 온다", () => {
    expect(QUESTION_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
      QUERY_DRIVER_EVENTS_TOOL_NAME,
      LOOKUP_F1_KNOWLEDGE_TOOL_NAME,
    ]);
  });

  it("지식 툴이 topic 을 필수로 요구한다", () => {
    const definition = QUESTION_TOOL_DEFINITIONS.find(
      (tool) => tool.name === LOOKUP_F1_KNOWLEDGE_TOOL_NAME,
    );

    expect(Object.keys(definition?.parameters.properties ?? {})).toEqual([
      "topic",
    ]);
    expect(definition?.parameters.required).toEqual(["topic"]);
  });

  it("지식 툴 description 이 지어내지 말 것을 명시한다", () => {
    const definition = QUESTION_TOOL_DEFINITIONS.find(
      (tool) => tool.name === LOOKUP_F1_KNOWLEDGE_TOOL_NAME,
    );

    expect(definition?.description).toContain("ONLY from what this tool returns");
    expect(definition?.description).toContain("say you do not know");
  });
});
