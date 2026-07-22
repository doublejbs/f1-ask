import { describe, expect, it } from "vitest";
import { AiCommentary, toAiCommentary } from "../src/ai/AiCommentary";
import { CommentaryContext } from "../src/ai/CommentaryContext";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { RaceEventScope } from "../src/RaceEventScope";
import {
  COMMENTARY_SCHEMA_VERSION,
  MAX_FIRESTORE_DOC_ID_BYTES,
  toAiCommentaryFromDocument,
  toCommentaryDocId,
  toCommentaryDocument,
} from "../src/firestore/CommentaryDocument";
import { firestorePaths } from "../src/firestore/LiveRaceRepository";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import { SupportedLocale } from "../src/SupportedLocale";

// 실제 폴러가 만드는 형태의 eventId (콜론 구분).
const EVENT_ID = "2026-bel-race:penalty:penalty:HAM:1784467391000";

const GENERATED_AT = "2026-07-19T05:12:00.000Z";

// 페널티가 나온 그 시점(12랩)의 맥락. 질문 때 44랩이 아니라 이 순위로 답해야 한다.
const POINT_IN_TIME_CONTEXT: CommentaryContext = {
  scope: RaceEventScope.Driver,
  event: {
    type: RaceEventType.Penalty,
    driverNumber: 44,
    driverCode: "HAM",
    lapNumber: 12,
    params: { seconds: 5 },
  },
  session: {
    status: "active",
    currentLap: 12,
    totalLaps: 44,
    lapsRemaining: 32,
    retiredCount: 0,
  },
  standings: [
    { position: 1, code: "VER", team: "Red Bull", gapToLeaderSeconds: null },
    { position: 4, code: "HAM", team: "Ferrari", gapToLeaderSeconds: 12.4 },
    { position: 5, code: "PIA", team: "McLaren", gapToLeaderSeconds: 13.9 },
  ],
  recentCommentary: [],
};

const buildEvent = (): RaceEvent => ({
  schemaVersion: 1,
  id: EVENT_ID,
  sessionId: "2026-bel-race",
  type: RaceEventType.Penalty,
  priority: RaceEventPriority.High,
  driverNumber: 44,
  lapNumber: 38,
  timestamp: "2026-07-19T05:11:31.000Z",
  params: { seconds: 5 },
  deduplicationKey: EVENT_ID,
});

describe("toCommentaryDocId", () => {
  it("같은 이벤트·locale·설명수준이면 항상 같은 id 다 (멱등)", () => {
    const first = toCommentaryDocId(
      EVENT_ID,
      SupportedLocale.Ko,
      ExplanationLevel.Standard,
    );
    const second = toCommentaryDocId(
      EVENT_ID,
      SupportedLocale.Ko,
      ExplanationLevel.Standard,
    );

    expect(first).toBe(second);
    expect(first).toBe(`${EVENT_ID}:ko:standard`);
  });

  it("locale 이나 설명수준이 다르면 id 가 갈린다", () => {
    const ids = new Set([
      toCommentaryDocId(EVENT_ID, SupportedLocale.Ko, ExplanationLevel.Standard),
      toCommentaryDocId(EVENT_ID, SupportedLocale.En, ExplanationLevel.Standard),
      toCommentaryDocId(EVENT_ID, SupportedLocale.Ja, ExplanationLevel.Standard),
      toCommentaryDocId(EVENT_ID, SupportedLocale.Ko, ExplanationLevel.Beginner),
      toCommentaryDocId(EVENT_ID, SupportedLocale.Ko, ExplanationLevel.Expert),
    ]);

    expect(ids.size).toBe(5);
  });

  it("금지 문자가 든 eventId 를 넣어도 문서 id 에 남지 않는다", () => {
    const dirtyEventId = "a/b//c d\ne\tf#g?h[i]j*k~l";

    const docId = toCommentaryDocId(
      dirtyEventId,
      SupportedLocale.Ko,
      ExplanationLevel.Standard,
    );

    expect(docId).not.toContain("/");
    expect(docId).toMatch(/^[A-Za-z0-9:._~-]+$/);
    // Firestore 예약 id (`.` · `..` · `__*__`) 를 피하는 것은 escape 가 아니라
    // 항상 붙는 `:{locale}:{level}` 접미사다. 접미사를 빼는 순간 예약 id 가 다시
    // 도달 가능해지므로, 막연히 `not.toBe(".")` 를 두는 대신 접미사 자체를 고정한다.
    expect(docId.endsWith(":ko:standard")).toBe(true);
  });

  it("금지 문자를 치환해도 서로 다른 eventId 가 같은 id 로 합쳐지지 않는다", () => {
    const first = toCommentaryDocId(
      "a/b",
      SupportedLocale.Ko,
      ExplanationLevel.Standard,
    );
    const second = toCommentaryDocId(
      "a b",
      SupportedLocale.Ko,
      ExplanationLevel.Standard,
    );

    expect(first).not.toBe(second);
  });

  it("아주 긴 eventId 도 Firestore 문서 id 상한 안에 들어온다", () => {
    const longEventId = "x".repeat(5000);

    const docId = toCommentaryDocId(
      longEventId,
      SupportedLocale.Ko,
      ExplanationLevel.Standard,
    );

    expect(new TextEncoder().encode(docId).length).toBeLessThanOrEqual(
      MAX_FIRESTORE_DOC_ID_BYTES,
    );
    // 잘라내도 멱등은 유지된다.
    expect(docId).toBe(
      toCommentaryDocId(
        longEventId,
        SupportedLocale.Ko,
        ExplanationLevel.Standard,
      ),
    );
  });

  it("멀티바이트 문자가 섞여도 바이트 상한을 넘지 않는다", () => {
    const docId = toCommentaryDocId(
      "한글".repeat(2000),
      SupportedLocale.Ko,
      ExplanationLevel.Standard,
    );

    expect(new TextEncoder().encode(docId).length).toBeLessThanOrEqual(
      MAX_FIRESTORE_DOC_ID_BYTES,
    );
  });
});

describe("firestorePaths.aiCommentary", () => {
  it("이벤트와 같은 세션 하위에 놓인다", () => {
    const docId = toCommentaryDocId(
      EVENT_ID,
      SupportedLocale.Ko,
      ExplanationLevel.Standard,
    );

    expect(firestorePaths.aiCommentary("2026-bel-race")).toBe(
      "sessions/2026-bel-race/aiCommentary",
    );
    expect(firestorePaths.aiCommentaryDoc("2026-bel-race", docId)).toBe(
      `sessions/2026-bel-race/aiCommentary/${docId}`,
    );
  });
});

describe("toCommentaryDocument", () => {
  it("저장 문서에 생성 맥락(locale·설명수준·모델)이 담긴다", () => {
    const commentary = toAiCommentary(buildEvent(), "HAM 의 5초 페널티가 순위를 흔든다");

    const document = toCommentaryDocument(
      commentary,
      SupportedLocale.Ko,
      ExplanationLevel.Standard,
      "gemini-3.5-flash",
      GENERATED_AT,
    );

    expect(document).toEqual({
      schemaVersion: COMMENTARY_SCHEMA_VERSION,
      sourceEventId: EVENT_ID,
      sourceEventType: RaceEventType.Penalty,
      priority: RaceEventPriority.High,
      locale: SupportedLocale.Ko,
      explanationLevel: ExplanationLevel.Standard,
      text: "HAM 의 5초 페널티가 순위를 흔든다",
      timestamp: "2026-07-19T05:11:31.000Z",
      generatedAt: GENERATED_AT,
      model: "gemini-3.5-flash",
    });
  });

  it("시점 맥락을 넘기면 문서에 그대로 담기고 왕복 보존된다", () => {
    const commentary = toAiCommentary(buildEvent(), "HAM 의 5초 페널티가 순위를 흔든다");

    const document = toCommentaryDocument(
      commentary,
      SupportedLocale.Ko,
      ExplanationLevel.Standard,
      "gemini-3.5-flash",
      GENERATED_AT,
      POINT_IN_TIME_CONTEXT,
    );

    // 재조회 없이 이 맥락을 질문에 쓰므로 직렬화 왕복에서 한 글자도 잃으면 안 된다.
    expect(document.pointInTimeContext).toEqual(POINT_IN_TIME_CONTEXT);
    expect(JSON.parse(JSON.stringify(document)).pointInTimeContext).toEqual(
      POINT_IN_TIME_CONTEXT,
    );
  });

  it("시점 맥락을 넘기지 않으면 필드 자체가 없다 (mock·replay·옛 문서 방어)", () => {
    const commentary = toAiCommentary(buildEvent(), "텍스트");

    const document = toCommentaryDocument(
      commentary,
      SupportedLocale.Ko,
      ExplanationLevel.Standard,
      "gemini-3.5-flash",
      GENERATED_AT,
    );

    // Firestore 는 undefined 값을 거부하므로 키 자체가 없어야 한다.
    expect(Object.keys(document)).not.toContain("pointInTimeContext");
  });

  it("isMock 을 저장 문서에 담지 않는다", () => {
    const commentary = toAiCommentary(buildEvent(), "텍스트");

    const document = toCommentaryDocument(
      commentary,
      SupportedLocale.Ko,
      ExplanationLevel.Standard,
      "gemini-3.5-flash",
      GENERATED_AT,
    );

    expect(Object.keys(document)).not.toContain("isMock");
  });

  it("mock 해설은 저장을 거부한다", () => {
    const commentary = toAiCommentary(
      buildEvent(),
      "경기의 주목할 만한 순간입니다",
      true,
    );

    expect(() =>
      toCommentaryDocument(
        commentary,
        SupportedLocale.Ko,
        ExplanationLevel.Standard,
        "mock",
        GENERATED_AT,
      ),
    ).toThrow();
  });
});

describe("toAiCommentaryFromDocument", () => {
  it("저장 문서 ↔ AiCommentary 왕복에서 정보가 보존된다", () => {
    const original: AiCommentary = toAiCommentary(buildEvent(), "해설 문장이다");

    const restored = toAiCommentaryFromDocument(
      toCommentaryDocument(
        original,
        SupportedLocale.Ko,
        ExplanationLevel.Standard,
        "gemini-3.5-flash",
        GENERATED_AT,
      ),
    );

    expect(restored).toEqual(original);
  });

  it("저장된 시점 맥락을 도메인 해설로 실어 나른다", () => {
    // 클라이언트가 해설을 탭해 질문할 때 focus.context 를 채우려면 맥락이 문서에서
    // 도메인 해설까지 이어져야 한다 (docs/21-commentary-ask.md §질문 경로 확장).
    const document = toCommentaryDocument(
      toAiCommentary(buildEvent(), "HAM 의 5초 페널티가 순위를 흔든다"),
      SupportedLocale.Ko,
      ExplanationLevel.Standard,
      "gemini-3.5-flash",
      GENERATED_AT,
      POINT_IN_TIME_CONTEXT,
    );

    const restored = toAiCommentaryFromDocument(document);

    expect(restored.pointInTimeContext).toEqual(POINT_IN_TIME_CONTEXT);
  });

  it("맥락 없는 옛 문서는 필드 없이 복원된다", () => {
    const document = toCommentaryDocument(
      toAiCommentary(buildEvent(), "텍스트"),
      SupportedLocale.Ko,
      ExplanationLevel.Standard,
      "gemini-3.5-flash",
      GENERATED_AT,
    );

    const restored = toAiCommentaryFromDocument(document);

    expect(Object.keys(restored)).not.toContain("pointInTimeContext");
  });
});
