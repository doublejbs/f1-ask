import { ExplanationLevel } from "../ExplanationLevel";
import { LiveDriverState } from "../LiveDriverState";
import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { RaceEvent } from "../RaceEvent";
import { RaceEventType } from "../RaceEventType";
import { SupportedLocale } from "../SupportedLocale";
import { AiConfidence } from "./AiConfidence";
import { QuestionIntent } from "./QuestionIntent";
import {
  LlmAnswer,
  LlmCommentary,
  LlmCommentaryRequest,
  LlmQuestionRequest,
  LlmSummary,
  LlmSummaryRequest,
  RaceLlmProvider,
} from "./RaceLlmProvider";

type LocaleText = Record<SupportedLocale, string>;

const REFERENCED_EVENT_LIMIT = 3;

const pick = (locale: SupportedLocale, text: LocaleText): string => text[locale];

const fmtGap = (seconds: number | null): string =>
  seconds === null ? "—" : `${seconds.toFixed(1)}s`;

const fmtLap = (seconds: number | null): string => {
  if (seconds === null) {
    return "—";
  }

  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;

  return `${minutes}:${rest.toFixed(3).padStart(6, "0")}`;
};

const includesAny = (haystack: string, needles: readonly string[]): boolean =>
  needles.some((needle) => haystack.includes(needle));

// 의도 분류용 키워드 (latin 소문자 + CJK 원문).
const INTENT_KEYWORDS: Record<
  Exclude<QuestionIntent, QuestionIntent.General>,
  readonly string[]
> = {
  [QuestionIntent.Pit]: ["pit", "box", "피트", "들어가", "ピット", "ストップ"],
  [QuestionIntent.Gap]: [
    "gap",
    "catch",
    "close",
    "ahead",
    "behind",
    "interval",
    "chase",
    "간격",
    "따라",
    "앞차",
    "뒤",
    "差",
    "追い",
    "詰め",
  ],
  [QuestionIntent.Pace]: [
    "fast",
    "pace",
    "quick",
    "slow",
    "speed",
    "laptime",
    "lap time",
    "빠르",
    "페이스",
    "느리",
    "랩타임",
    "速",
    "ペース",
    "遅",
  ],
  [QuestionIntent.Tire]: [
    "tire",
    "tyre",
    "compound",
    "soft",
    "medium",
    "hard",
    "타이어",
    "컴파운드",
    "タイヤ",
  ],
  [QuestionIntent.Position]: [
    "position",
    "lead",
    "leader",
    "first",
    "winning",
    "rank",
    "순위",
    "선두",
    "위",
    "이기",
    "首位",
    "順位",
    "トップ",
    "勝",
  ],
};

const INTENT_PRIORITY: readonly Exclude<
  QuestionIntent,
  QuestionIntent.General
>[] = [
  QuestionIntent.Pit,
  QuestionIntent.Tire,
  QuestionIntent.Gap,
  QuestionIntent.Pace,
  QuestionIntent.Position,
];

// 결정론적 rule-based mock LLM.
// 실제 LLM 이 아니라, 현재 snapshot 데이터를 자연어로 설명만 한다.
// AI 규칙 준수 (PRD §14): 데이터를 만들지 않고, 현재 데이터만 설명하며,
// 팀 전략은 추정임을 명시하고, 대상을 특정할 수 없으면 모른다고 답한다.
export class MockLlmProvider implements RaceLlmProvider {
  answerQuestion(request: LlmQuestionRequest): Promise<LlmAnswer> {
    return Promise.resolve(this.buildAnswer(request));
  }

  generateCommentary(request: LlmCommentaryRequest): Promise<LlmCommentary> {
    return Promise.resolve({
      sourceEventId: request.event.id,
      isMock: true,
      text: this.withLevelNote(
        this.commentaryText(request.event, request.locale),
        this.commentaryLevelNote(
          request.event.type,
          request.explanationLevel,
          request.locale,
        ),
      ),
    });
  }

  generateSummary(request: LlmSummaryRequest): Promise<LlmSummary> {
    return Promise.resolve({
      text: this.summaryText(request),
    });
  }

  // 경기 종료 요약 서술. 도메인이 계산한 사실을 자연어로 정리만 한다.
  private summaryText(request: LlmSummaryRequest): string {
    const { summary, snapshot, locale } = request;

    const codeOf = (driverNumber: number | null): string => {
      if (driverNumber === null) {
        return "—";
      }

      return (
        snapshot.drivers.find(
          (driver) => driver.driverNumber === driverNumber,
        )?.code ?? "—"
      );
    };

    const winner = codeOf(summary.winnerDriverNumber);
    const fastest = codeOf(summary.fastestLapDriverNumber);
    const retirements = summary.retiredDriverNumbers.length;

    const retirementText: LocaleText = {
      en: retirements > 0 ? ` ${retirements} car(s) retired.` : "",
      ko: retirements > 0 ? ` ${retirements}대가 리타이어했습니다.` : "",
      ja: retirements > 0 ? ` ${retirements}台がリタイアしました。` : "",
    };

    return pick(locale, {
      en: `${winner} won ${summary.sessionName}. Fastest lap: ${fastest}. The race had ${summary.totalOvertakes} overtakes and ${summary.totalPitStops} pit stops.${retirementText.en} This recap is based on the recorded data.`,
      ko: `${summary.sessionName}는 ${winner}의 우승으로 끝났습니다. 패스티스트 랩은 ${fastest}. 경기 중 추월 ${summary.totalOvertakes}회, 피트스톱 ${summary.totalPitStops}회가 있었습니다.${retirementText.ko} 이 요약은 기록된 데이터를 기반으로 합니다.`,
      ja: `${summary.sessionName} は ${winner} の優勝で終了しました。ファステストラップは ${fastest}。レースでは${summary.totalOvertakes}回のオーバーテイクと${summary.totalPitStops}回のピットストップがありました。${retirementText.ja} この要約は記録データに基づきます。`,
    });
  }

  // 이벤트의 "의미"를 설명하는 자유 문장을 생성한다.
  // 중계 해설을 대체하지 않고 전략적 의미를 짧게 설명한다 (PRD §8.2).
  private commentaryText(event: RaceEvent, locale: SupportedLocale): string {
    const driver = this.paramString(event, "driverCode");
    const target = this.paramString(event, "targetDriverCode");
    const compound = this.paramString(event, "compound");

    switch (event.type) {
      case RaceEventType.Overtake:
        return pick(locale, {
          en: `${driver} moves ahead of ${target} — track position gained on merit.`,
          ko: `${driver}가 ${target}를 제쳤습니다 — 트랙 포지션을 실력으로 얻었습니다.`,
          ja: `${driver} が ${target} を抜きました — 実力でトラックポジションを獲得。`,
        });
      case RaceEventType.PitStop:
        return pick(locale, {
          en: `${driver} pits for ${compound}. Fresh rubber should change their pace, but the full strategy can't be confirmed yet.`,
          ko: `${driver}가 ${compound} 타이어로 피트인했습니다. 새 타이어로 페이스가 달라지겠지만 전체 전략은 아직 확인할 수 없습니다.`,
          ja: `${driver} が ${compound} でピットイン。新品タイヤでペースは変わりますが、全体戦略はまだ確認できません。`,
        });
      case RaceEventType.SafetyCar:
        return pick(locale, {
          en: "Safety Car out — the field compresses. Cars yet to stop may gain by pitting now, though team calls can't be confirmed.",
          ko: "세이프티카 출동 — 간격이 좁혀집니다. 아직 정지하지 않은 차는 지금 피트해 이득을 볼 수 있지만 팀 판단은 확인할 수 없습니다.",
          ja: "セーフティカー導入 — 隊列が圧縮されます。まだ止まっていない車は今ピットで得をする可能性がありますが、チームの判断は確認できません。",
        });
      case RaceEventType.VirtualSafetyCar:
        return pick(locale, {
          en: "Virtual Safety Car — delta times apply, making a pit stop relatively cheaper right now.",
          ko: "버추얼 세이프티카 — 델타 타임이 적용되어 지금 피트 비용이 상대적으로 저렴합니다.",
          ja: "バーチャルセーフティカー — デルタタイムが適用され、今はピットの損失が比較的小さくなります。",
        });
      case RaceEventType.YellowFlag:
        return pick(locale, {
          en: "Yellow flag — drivers must lift in the affected sector; overtaking is not allowed there.",
          ko: "옐로 플래그 — 해당 섹터에서 속도를 줄여야 하며 추월이 금지됩니다.",
          ja: "イエローフラッグ — 該当セクターでは減速が必要で、追い越しは禁止です。",
        });
      case RaceEventType.RedFlag:
        return pick(locale, {
          en: "Red flag — the session is stopped. Teams may now change tires without a time loss.",
          ko: "레드 플래그 — 세션이 중단됩니다. 팀은 이제 시간 손실 없이 타이어를 교체할 수 있습니다.",
          ja: "レッドフラッグ — セッション中断。チームはタイムロスなくタイヤ交換が可能になります。",
        });
      case RaceEventType.SessionRestarted:
        return pick(locale, {
          en: "Racing resumes — gaps have closed, so expect position battles into the next few laps.",
          ko: "경기 재시작 — 간격이 좁혀져 다음 몇 랩 동안 순위 다툼이 예상됩니다.",
          ja: "レース再開 — 差が縮まり、この先数周は順位争いが予想されます。",
        });
      case RaceEventType.Retirement:
        return pick(locale, {
          en: `${driver} is out of the race — every car behind moves up one place.`,
          ko: `${driver}가 리타이어했습니다 — 뒤차들이 한 계단씩 올라갑니다.`,
          ja: `${driver} がリタイア — 後続は全員1つ順位が上がります。`,
        });
      case RaceEventType.SessionFinished:
        return pick(locale, {
          en: "The session has finished. Final positions are now set.",
          ko: "세션이 종료되었습니다. 최종 순위가 확정되었습니다.",
          ja: "セッションが終了しました。最終順位が確定しました。",
        });
      default:
        return pick(locale, {
          en: `${driver} — a notable moment in the race.`,
          ko: `${driver} — 경기의 주목할 만한 순간입니다.`,
          ja: `${driver} — レースの注目すべき瞬間です。`,
        });
    }
  }

  private paramString(event: RaceEvent, key: string): string {
    const value = event.params[key];

    return typeof value === "string" && value.length > 0 ? value : "";
  }

  // 설명 수준에 따른 부가 설명을 본문에 덧붙인다 (Standard 면 그대로).
  private withLevelNote(base: string, note: string): string {
    return note.length > 0 ? `${base} ${note}` : base;
  }

  // Ask AI 답변용 수준 노트. Beginner 는 개념 풀이, Expert 는 전략 심화.
  private answerLevelNote(
    intent: QuestionIntent,
    level: ExplanationLevel,
    locale: SupportedLocale,
  ): string {
    if (level === ExplanationLevel.Beginner) {
      switch (intent) {
        case QuestionIntent.Pit:
          return pick(locale, {
            en: "Tip: a pit stop swaps tyres in the pit lane and costs roughly 20-25s.",
            ko: "팁: 피트스톱은 피트 레인에서 타이어를 교체하며 약 20~25초가 걸립니다.",
            ja: "ヒント: ピットストップはピットレーンでタイヤを交換し、約20〜25秒かかります。",
          });
        case QuestionIntent.Gap:
          return pick(locale, {
            en: "Tip: the gap is the time to the car ahead; under ~1s unlocks overtake mode.",
            ko: "팁: 간격은 앞차와의 시간 차이이며, 약 1초 이내면 오버테이크 모드를 쓸 수 있습니다.",
            ja: "ヒント: 差は前車とのタイム差で、約1秒以内でオーバーテイクモードが使えます。",
          });
        case QuestionIntent.Pace:
          return pick(locale, {
            en: "Tip: a lower lap time means a faster lap.",
            ko: "팁: 랩타임이 낮을수록 더 빠른 랩입니다.",
            ja: "ヒント: ラップタイムが低いほど速いラップです。",
          });
        case QuestionIntent.Tire:
          return pick(locale, {
            en: "Tip: softer tyres grip more but wear out faster.",
            ko: "팁: 소프트 타이어는 그립이 좋지만 더 빨리 닳습니다.",
            ja: "ヒント: ソフトタイヤはグリップが高いですが摩耗が早いです。",
          });
        case QuestionIntent.Position:
          return pick(locale, {
            en: "Tip: P1 means first place — the race leader.",
            ko: "팁: P1은 1위, 즉 선두를 뜻합니다.",
            ja: "ヒント: P1は1位、つまり首位を意味します。",
          });
        default:
          return "";
      }
    }

    if (level === ExplanationLevel.Expert) {
      switch (intent) {
        case QuestionIntent.Pit:
          return pick(locale, {
            en: "Note: weigh undercut vs overcut against tyre-deg delta and pit-lane loss.",
            ko: "참고: 언더컷과 오버컷을 타이어 마모 델타와 피트 손실 대비 저울질하세요.",
            ja: "補足: アンダーカットとオーバーカットをタイヤ摩耗差とピットロスと比較しましょう。",
          });
        case QuestionIntent.Gap:
          return pick(locale, {
            en: "Note: sub-1s unlocks overtake mode; balance track position against tyre offset.",
            ko: "참고: 1초 이내면 오버테이크 모드가 열리며, 트랙 포지션과 타이어 오프셋을 균형 있게 보세요.",
            ja: "補足: 1秒以内でオーバーテイクモードが有効。トラックポジションとタイヤオフセットのバランスを見ましょう。",
          });
        case QuestionIntent.Pace:
          return pick(locale, {
            en: "Note: compare fuel- and stint-adjusted pace, not raw lap time.",
            ko: "참고: 원시 랩타임이 아니라 연료·스틴트 보정 페이스를 비교하세요.",
            ja: "補足: 生のラップタイムでなく燃料・スティント補正ペースを比較しましょう。",
          });
        case QuestionIntent.Tire:
          return pick(locale, {
            en: "Note: compound offset drives strategy divergence across the field.",
            ko: "참고: 컴파운드 오프셋이 필드 전반의 전략 분화를 만듭니다.",
            ja: "補足: コンパウンドオフセットがフィールドの戦略分岐を生みます。",
          });
        case QuestionIntent.Position:
          return pick(locale, {
            en: "Note: at this circuit, track position can outweigh raw pace.",
            ko: "참고: 이 트랙에서는 트랙 포지션이 순수 페이스보다 중요할 수 있습니다.",
            ja: "補足: このコースではトラックポジションが素のペースを上回ることがあります。",
          });
        default:
          return "";
      }
    }

    return "";
  }

  // AI 해설용 수준 노트. 일부 이벤트 유형에만 적용한다.
  private commentaryLevelNote(
    eventType: RaceEventType,
    level: ExplanationLevel,
    locale: SupportedLocale,
  ): string {
    if (level === ExplanationLevel.Beginner) {
      switch (eventType) {
        case RaceEventType.PitStop:
          return pick(locale, {
            en: "Beginner: fresh tyres are quicker at first, then gradually fade.",
            ko: "입문: 새 타이어는 처음엔 빠르지만 점점 성능이 떨어집니다.",
            ja: "初級: 新品タイヤは最初は速いですが、徐々に性能が落ちます。",
          });
        case RaceEventType.SafetyCar:
        case RaceEventType.VirtualSafetyCar:
          return pick(locale, {
            en: "Beginner: everyone slows and bunches up, erasing most gaps.",
            ko: "입문: 모두 속도를 줄여 간격이 대부분 사라지고 촘촘해집니다.",
            ja: "初級: 全員が減速して差がほぼ消え、隊列が密集します。",
          });
        case RaceEventType.Overtake:
          return pick(locale, {
            en: "Beginner: this means one car passed another for position.",
            ko: "입문: 한 차가 다른 차를 제쳐 순위를 올렸다는 뜻입니다.",
            ja: "初級: 一台が別の車を抜いて順位を上げたということです。",
          });
        default:
          return "";
      }
    }

    if (level === ExplanationLevel.Expert) {
      switch (eventType) {
        case RaceEventType.PitStop:
          return pick(locale, {
            en: "Expert: the undercut pays off only if the out-lap gain beats the pit loss.",
            ko: "숙련: 언더컷은 아웃랩 이득이 피트 손실을 넘을 때만 효과가 있습니다.",
            ja: "上級: アンダーカットはアウトラップの利得がピットロスを上回る場合のみ有効です。",
          });
        case RaceEventType.SafetyCar:
        case RaceEventType.VirtualSafetyCar:
          return pick(locale, {
            en: "Expert: a stop under neutralization costs less, so cheap pit windows open.",
            ko: "숙련: 중립화 구간의 피트는 손실이 적어 저렴한 피트 윈도우가 열립니다.",
            ja: "上級: 中立化中のピットは損失が小さく、割安なピットウィンドウが開きます。",
          });
        default:
          return "";
      }
    }

    return "";
  }

  private buildAnswer(request: LlmQuestionRequest): LlmAnswer {
    const {
      question,
      locale,
      explanationLevel,
      snapshot,
      recentEvents,
      favoriteDriverNumbers,
    } = request;

    const intent = this.detectIntent(question);
    const resolved = this.resolveDriver(
      question,
      snapshot,
      favoriteDriverNumbers,
    );

    const base = {
      dataTimestamp: snapshot.sourceUpdatedAt,
      snapshotVersion: snapshot.version,
      suggestedQuestions: this.suggestedQuestions(locale),
    };

    const requiresDriver =
      intent === QuestionIntent.Pit ||
      intent === QuestionIntent.Tire ||
      intent === QuestionIntent.Gap ||
      intent === QuestionIntent.Pace;

    if (requiresDriver && resolved === null) {
      return {
        ...base,
        answer: pick(locale, {
          en: "I can't tell which driver you mean. Try a driver code like \"NOR\" or star a favorite driver.",
          ko: '어떤 드라이버를 말하는지 알 수 없어요. "NOR" 같은 드라이버 코드를 쓰거나 관심 드라이버를 선택해 주세요.',
          ja: "どのドライバーか特定できません。「NOR」のようなコードを入力するか、お気に入りを選んでください。",
        }),
        confidence: AiConfidence.Low,
        insufficientData: true,
        referencedDriverNumbers: [],
        referencedEventIds: [],
      };
    }

    const driver = resolved?.driver ?? null;
    const confidence = this.confidenceFor(intent, resolved);
    const answer = this.withLevelNote(
      this.answerFor(intent, locale, snapshot, driver),
      this.answerLevelNote(intent, explanationLevel, locale),
    );
    const referencedDriverNumbers = this.referencedDrivers(
      intent,
      snapshot,
      driver,
    );
    const referencedEventIds = this.referencedEvents(recentEvents, driver);

    return {
      ...base,
      answer,
      confidence,
      insufficientData: false,
      referencedDriverNumbers,
      referencedEventIds,
    };
  }

  private detectIntent(question: string): QuestionIntent {
    const normalized = question.toLowerCase();

    for (const intent of INTENT_PRIORITY) {
      if (includesAny(normalized, INTENT_KEYWORDS[intent])) {
        return intent;
      }
    }

    return QuestionIntent.General;
  }

  // 질문에서 드라이버를 특정한다. 명시적 언급 우선, 없으면 관심 드라이버로 폴백.
  private resolveDriver(
    question: string,
    snapshot: LiveRaceSnapshot,
    favoriteDriverNumbers: number[],
  ): { driver: LiveDriverState; explicit: boolean } | null {
    const upper = question.toUpperCase();
    const lower = question.toLowerCase();

    const explicitMatches = snapshot.drivers.filter((driver) => {
      const lastName = driver.fullName.split(" ").at(-1) ?? "";
      const codeHit = new RegExp(`\\b${driver.code}\\b`).test(upper);
      const numberHit = new RegExp(`\\b${driver.driverNumber}\\b`).test(question);
      const nameHit =
        lower.includes(driver.fullName.toLowerCase()) ||
        (lastName.length >= 4 && lower.includes(lastName.toLowerCase()));

      return codeHit || numberHit || nameHit;
    });

    const best = this.bestByPosition(explicitMatches);

    if (best !== null) {
      return { driver: best, explicit: true };
    }

    for (const driverNumber of favoriteDriverNumbers) {
      const favorite = snapshot.drivers.find(
        (driver) => driver.driverNumber === driverNumber,
      );

      if (favorite !== undefined) {
        return { driver: favorite, explicit: false };
      }
    }

    return null;
  }

  private bestByPosition(drivers: LiveDriverState[]): LiveDriverState | null {
    let best: LiveDriverState | null = null;

    for (const driver of drivers) {
      if (best === null) {
        best = driver;
        continue;
      }

      const bestPos = best.position ?? Number.POSITIVE_INFINITY;
      const pos = driver.position ?? Number.POSITIVE_INFINITY;

      if (pos < bestPos) {
        best = driver;
      }
    }

    return best;
  }

  private confidenceFor(
    intent: QuestionIntent,
    resolved: { driver: LiveDriverState; explicit: boolean } | null,
  ): AiConfidence {
    if (resolved === null) {
      // Position/General 은 드라이버 없이도 답할 수 있다.
      return intent === QuestionIntent.Position ||
        intent === QuestionIntent.General
        ? AiConfidence.High
        : AiConfidence.Low;
    }

    return resolved.explicit ? AiConfidence.High : AiConfidence.Medium;
  }

  private leaderOf(snapshot: LiveRaceSnapshot): LiveDriverState | null {
    return snapshot.drivers.find((driver) => driver.position === 1) ?? null;
  }

  private carAheadOf(
    snapshot: LiveRaceSnapshot,
    driver: LiveDriverState,
  ): LiveDriverState | null {
    if (driver.position === null) {
      return null;
    }

    const targetPosition = driver.position - 1;

    return (
      snapshot.drivers.find((other) => other.position === targetPosition) ?? null
    );
  }

  private answerFor(
    intent: QuestionIntent,
    locale: SupportedLocale,
    snapshot: LiveRaceSnapshot,
    driver: LiveDriverState | null,
  ): string {
    switch (intent) {
      case QuestionIntent.Pit:
        return this.answerPit(locale, driver);
      case QuestionIntent.Tire:
        return this.answerTire(locale, driver);
      case QuestionIntent.Gap:
        return this.answerGap(locale, snapshot, driver);
      case QuestionIntent.Pace:
        return this.answerPace(locale, driver);
      case QuestionIntent.Position:
        return this.answerPosition(locale, snapshot, driver);
      default:
        return this.answerGeneral(locale, snapshot);
    }
  }

  private answerPit(
    locale: SupportedLocale,
    driver: LiveDriverState | null,
  ): string {
    if (driver === null) {
      return this.answerGeneralFallback(locale);
    }

    const code = driver.code;
    const age = driver.tireAgeLaps ?? 0;
    const stops = driver.pitStopCount;

    return pick(locale, {
      en: `${code} is on ${driver.compound} tires, ${age} laps old, with ${stops} stop(s) so far. The team's actual pit call can't be confirmed from the current data.`,
      ko: `${code}는 현재 ${driver.compound} 타이어(${age}랩 사용), 지금까지 피트 ${stops}회입니다. 실제 팀의 피트 전략은 현재 데이터로 확인할 수 없습니다.`,
      ja: `${code} は現在 ${driver.compound} タイヤ（${age}周使用）、ここまでピット${stops}回です。チームの実際のピット判断は現在のデータでは確認できません。`,
    });
  }

  private answerTire(
    locale: SupportedLocale,
    driver: LiveDriverState | null,
  ): string {
    if (driver === null) {
      return this.answerGeneralFallback(locale);
    }

    const age = driver.tireAgeLaps ?? 0;

    return pick(locale, {
      en: `${driver.code} is running the ${driver.compound} compound, ${age} laps old.`,
      ko: `${driver.code}는 ${driver.compound} 컴파운드를 사용 중이며 ${age}랩 경과했습니다.`,
      ja: `${driver.code} は ${driver.compound} コンパウンドで、${age}周使用しています。`,
    });
  }

  private answerGap(
    locale: SupportedLocale,
    snapshot: LiveRaceSnapshot,
    driver: LiveDriverState | null,
  ): string {
    if (driver === null) {
      return this.answerGeneralFallback(locale);
    }

    const ahead = this.carAheadOf(snapshot, driver);
    const interval = fmtGap(driver.intervalToAheadSeconds);
    const aheadCode = ahead?.code ?? "—";
    const position = driver.position ?? "—";

    return pick(locale, {
      en: `${driver.code} is P${position}, ${interval} behind ${aheadCode} ahead. This is based on the current gap only.`,
      ko: `${driver.code}는 현재 ${position}위로, 앞차 ${aheadCode}와 ${interval} 차이입니다. 현재 간격 기준입니다.`,
      ja: `${driver.code} は現在${position}位で、前の ${aheadCode} と ${interval} 差です。現在のギャップに基づく情報です。`,
    });
  }

  private answerPace(
    locale: SupportedLocale,
    driver: LiveDriverState | null,
  ): string {
    if (driver === null) {
      return this.answerGeneralFallback(locale);
    }

    const last = fmtLap(driver.lastLapSeconds);
    const best = fmtLap(driver.personalBestLapSeconds);

    return pick(locale, {
      en: `${driver.code}'s last lap was ${last} (personal best ${best}). This reflects current data only.`,
      ko: `${driver.code}의 최근 랩은 ${last}이고 개인 최고는 ${best}입니다. 현재 데이터 기준입니다.`,
      ja: `${driver.code} の最終ラップは ${last}、自己ベストは ${best} です。現在のデータに基づきます。`,
    });
  }

  private answerPosition(
    locale: SupportedLocale,
    snapshot: LiveRaceSnapshot,
    driver: LiveDriverState | null,
  ): string {
    const leader = this.leaderOf(snapshot);
    const leaderCode = leader?.code ?? "—";

    if (driver !== null && driver.position !== 1) {
      const gap = fmtGap(driver.gapToLeaderSeconds);

      return pick(locale, {
        en: `${leaderCode} leads. ${driver.code} is P${driver.position ?? "—"}, ${gap} off the lead.`,
        ko: `선두는 ${leaderCode}입니다. ${driver.code}는 ${driver.position ?? "—"}위로 선두와 ${gap} 차이입니다.`,
        ja: `首位は ${leaderCode} です。${driver.code} は${driver.position ?? "—"}位で、首位と ${gap} 差です。`,
      });
    }

    return pick(locale, {
      en: `${leaderCode} is currently leading the race.`,
      ko: `현재 선두는 ${leaderCode}입니다.`,
      ja: `現在の首位は ${leaderCode} です。`,
    });
  }

  private answerGeneral(
    locale: SupportedLocale,
    snapshot: LiveRaceSnapshot,
  ): string {
    const leader = this.leaderOf(snapshot);
    const leaderCode = leader?.code ?? "—";
    const lap = snapshot.currentLap ?? "—";
    const total = snapshot.totalLaps ?? "—";

    return pick(locale, {
      en: `Lap ${lap} of ${total}, status ${snapshot.status}. ${leaderCode} leads. Ask about a driver's pace, gap, tires or pit for more.`,
      ko: `${total}랩 중 ${lap}랩, 상태는 ${snapshot.status}입니다. 선두는 ${leaderCode}입니다. 특정 드라이버의 페이스·간격·타이어·피트를 물어보세요.`,
      ja: `${total}周中${lap}周、状態は ${snapshot.status} です。首位は ${leaderCode}。特定ドライバーのペース・差・タイヤ・ピットを尋ねてください。`,
    });
  }

  private answerGeneralFallback(locale: SupportedLocale): string {
    return pick(locale, {
      en: "I don't have enough data to answer that from the current snapshot.",
      ko: "현재 스냅샷 데이터만으로는 답하기 어렵습니다.",
      ja: "現在のスナップショットだけでは十分に答えられません。",
    });
  }

  private referencedDrivers(
    intent: QuestionIntent,
    snapshot: LiveRaceSnapshot,
    driver: LiveDriverState | null,
  ): number[] {
    const numbers: number[] = [];

    if (driver !== null) {
      numbers.push(driver.driverNumber);

      if (intent === QuestionIntent.Gap) {
        const ahead = this.carAheadOf(snapshot, driver);

        if (ahead !== null) {
          numbers.push(ahead.driverNumber);
        }
      }
    }

    if (intent === QuestionIntent.Position || intent === QuestionIntent.General) {
      const leader = this.leaderOf(snapshot);

      if (leader !== null && !numbers.includes(leader.driverNumber)) {
        numbers.push(leader.driverNumber);
      }
    }

    return numbers;
  }

  private referencedEvents(
    recentEvents: RaceEvent[],
    driver: LiveDriverState | null,
  ): string[] {
    if (driver === null) {
      return [];
    }

    return recentEvents
      .filter(
        (event) =>
          event.driverNumber === driver.driverNumber ||
          event.targetDriverNumber === driver.driverNumber,
      )
      .slice(-REFERENCED_EVENT_LIMIT)
      .reverse()
      .map((event) => event.id);
  }

  private suggestedQuestions(locale: SupportedLocale): string[] {
    switch (locale) {
      case SupportedLocale.Ko:
        return [
          "지금 누가 선두야?",
          "NOR 페이스 어때?",
          "VER 타이어 몇 랩 됐어?",
        ];
      case SupportedLocale.Ja:
        return [
          "今は誰が首位？",
          "NOR のペースは？",
          "VER のタイヤは何周目？",
        ];
      default:
        return [
          "Who is leading now?",
          "How is NOR's pace?",
          "How old are VER's tires?",
        ];
    }
  }
}
