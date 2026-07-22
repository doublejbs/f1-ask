import {
  InvestigationStatus,
  RaceEvent,
  RaceEventParams,
  RaceEventType,
  RaceIncidentReason,
  RetirementReason,
  SupportedLocale,
  TrackHazardKind,
} from "@f1/domain";

// 이벤트는 type + params 로 저장되고, UI 가 locale 에 따라 번역한다.
// (docs/02-architecture.md §39.3) 지원되지 않는 event type 도 raw JSON 을
// 노출하지 않고 fallback 메시지를 사용한다.

type LocaleText = Record<SupportedLocale, string>;

const pick = (locale: SupportedLocale, text: LocaleText): string => text[locale];

const asString = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.length > 0 ? value : fallback;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

// 90.771 → "1:30.771"
const formatLapTime = (seconds: number | null): string => {
  if (seconds === null) {
    return "—";
  }

  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  const restText = rest.toFixed(3).padStart(6, "0");

  return `${minutes}:${restText}`;
};

// 생성 측(OpenF1RaceControlParsing)은 알려진 사유만 `RaceIncidentReason` enum 값으로
// 정규화해 params.reason 에 담고, 모르는 문구는 아예 담지 않는다.
// 따라서 여기서는 자유 텍스트 매칭 없이 enum 키 정확 매칭만 수행한다.
// `Record<RaceIncidentReason, ...>` 전체를 요구하므로 enum 에 멤버가 추가되면 타입 에러로 잡힌다.
const REASON_TEXTS: Record<RaceIncidentReason, LocaleText> = {
  [RaceIncidentReason.CausingACollision]: {
    en: "causing a collision",
    ko: "충돌 유발",
    ja: "衝突の誘発",
  },
  [RaceIncidentReason.CarSafetyLights]: {
    en: "car safety lights",
    ko: "차량 안전등 문제",
    ja: "セーフティライトの不具合",
  },
  [RaceIncidentReason.TrackLimits]: {
    en: "track limits",
    ko: "트랙 리밋 위반",
    ja: "トラックリミット違反",
  },
  [RaceIncidentReason.LapTimeDeleted]: {
    en: "a deleted lap time",
    ko: "랩타임 삭제",
    ja: "ラップタイム抹消",
  },
  [RaceIncidentReason.UnsafeRelease]: {
    en: "an unsafe release",
    ko: "위험한 피트 리스",
    ja: "危険なリリース",
  },
  [RaceIncidentReason.SpeedingInThePitLane]: {
    en: "pit lane speeding",
    ko: "피트레인 과속",
    ja: "ピットレーン速度超過",
  },
  [RaceIncidentReason.ForcingAnotherDriverOffTheTrack]: {
    en: "forcing another driver off track",
    ko: "상대 드라이버 트랙 밖 압박",
    ja: "他車のコース外への押し出し",
  },
  [RaceIncidentReason.Impeding]: {
    en: "impeding another driver",
    ko: "주행 방해",
    ja: "走行妨害",
  },
  [RaceIncidentReason.FalseStart]: {
    en: "a false start",
    ko: "부정 출발",
    ja: "フライング",
  },
  [RaceIncidentReason.CrossingThePitExitLine]: {
    en: "crossing the pit exit line",
    ko: "피트 출구 라인 침범",
    ja: "ピット出口ライン越え",
  },
  [RaceIncidentReason.OvertakingUnderSafetyCar]: {
    en: "overtaking under the safety car",
    ko: "세이프티카 중 추월",
    ja: "セーフティカー中の追い越し",
  },
  [RaceIncidentReason.LeavingTheTrackAndGainingAnAdvantage]: {
    en: "leaving the track and gaining an advantage",
    ko: "트랙 이탈 후 이득",
    ja: "コース外走行による利得",
  },
  [RaceIncidentReason.IgnoringBlueFlags]: {
    en: "ignoring blue flags",
    ko: "블루 플래그 무시",
    ja: "ブルーフラッグ無視",
  },
  [RaceIncidentReason.DrivingErratically]: {
    en: "driving erratically",
    ko: "불규칙한 주행",
    ja: "不規則な走行",
  },
  [RaceIncidentReason.FailingToFollowRaceDirectorInstructions]: {
    en: "failing to follow race director instructions",
    ko: "레이스 디렉터 지시 불이행",
    ja: "レースディレクター指示の不履行",
  },
};

const RACE_INCIDENT_REASON_VALUES: readonly string[] =
  Object.values(RaceIncidentReason);

// enum 값이 아니면 null — 알 수 없는 값에 예외를 던지지 않는다.
const findReasonText = (raw: string): LocaleText | null => {
  if (!RACE_INCIDENT_REASON_VALUES.includes(raw)) {
    return null;
  }

  return REASON_TEXTS[raw as RaceIncidentReason];
};

// 번역 가능한 사유면 " (사유)" 접미사를, 아니면 빈 문자열을 돌려준다.
const reasonSuffix = (raw: string, locale: SupportedLocale): string => {
  if (raw.length === 0) {
    return "";
  }

  const text = findReasonText(raw);

  if (text === null) {
    return "";
  }

  return ` (${pick(locale, text)})`;
};

// 조사 이벤트는 다중 차량일 수 있다. 생성 측이 `driverCodes` 쉼표 문자열을 쓰거나
// `driverCode` / `targetDriverCode` 두 개를 쓸 수 있으므로 양쪽을 모두 방어적으로 읽는다.
const asDriverCodes = (params: RaceEventParams): string[] => {
  const sources = [
    params.driverCodes,
    params.driverCode,
    params.targetDriverCode,
  ];
  const codes: string[] = [];

  for (const source of sources) {
    if (typeof source !== "string") {
      continue;
    }

    for (const piece of source.split(",")) {
      const code = piece.trim();

      if (code.length > 0 && !codes.includes(code)) {
        codes.push(code);
      }
    }
  }

  return codes;
};

// 트랙 위험 요소 종류. 생성 측이 `TrackHazardKind` enum 값을 담으므로 정확 매칭한다.
const HAZARD_NOUNS: Record<TrackHazardKind, LocaleText> = {
  [TrackHazardKind.RecoveryVehicle]: {
    en: "Recovery vehicle",
    ko: "리커버리 차량",
    ja: "レッカー車",
  },
  [TrackHazardKind.Marshals]: {
    en: "Marshals",
    ko: "마샬",
    ja: "マーシャル",
  },
};

const TRACK_HAZARD_KIND_VALUES: readonly string[] =
  Object.values(TrackHazardKind);

const getHazardNoun = (kind: string): LocaleText => {
  if (!TRACK_HAZARD_KIND_VALUES.includes(kind)) {
    return { en: "Hazard", ko: "위험 요소", ja: "危険物" };
  }

  return HAZARD_NOUNS[kind as TrackHazardKind];
};

export const translateRaceEvent = (
  event: RaceEvent,
  locale: SupportedLocale,
): string => {
  const driver = asString(event.params.driverCode, "");
  const target = asString(event.params.targetDriverCode, "");
  const compound = asString(event.params.compound, "");
  const lap = formatLapTime(asNumber(event.params.lapTimeSeconds));

  switch (event.type) {
    case RaceEventType.SessionStarted:
      return pick(locale, {
        en: "Session started — green flag.",
        ko: "세션이 시작되었습니다 — 그린 플래그.",
        ja: "セッション開始 — グリーンフラッグ。",
      });
    case RaceEventType.SessionRestarted:
      return pick(locale, {
        en: "Race restarted — back to green.",
        ko: "경기가 재시작되었습니다 — 그린 플래그.",
        ja: "レース再開 — グリーンフラッグ。",
      });
    case RaceEventType.SessionFinished:
      return pick(locale, {
        en: "Session finished.",
        ko: "세션이 종료되었습니다.",
        ja: "セッション終了。",
      });
    case RaceEventType.PositionChange:
      return pick(locale, {
        en: `${driver} changed position.`,
        ko: `${driver} 순위 변동.`,
        ja: `${driver} 順位変動。`,
      });
    case RaceEventType.Overtake:
      return pick(locale, {
        en: `${driver} overtook ${target}.`,
        ko: `${driver}가 ${target}를 추월했습니다.`,
        ja: `${driver} が ${target} をオーバーテイク。`,
      });
    case RaceEventType.PitStop:
      return pick(locale, {
        en: `${driver} pitted for ${compound} tires.`,
        ko: `${driver}가 ${compound} 타이어로 피트인했습니다.`,
        ja: `${driver} が ${compound} タイヤでピットイン。`,
      });
    case RaceEventType.FastestLap:
      return pick(locale, {
        en: `${driver} set the fastest lap (${lap}).`,
        ko: `${driver}가 패스티스트 랩을 기록했습니다 (${lap}).`,
        ja: `${driver} がファステストラップを記録 (${lap})。`,
      });
    case RaceEventType.PersonalBestLap:
      return pick(locale, {
        en: `${driver} set a personal best (${lap}).`,
        ko: `${driver}가 개인 최고 랩을 기록했습니다 (${lap}).`,
        ja: `${driver} が自己ベストを記録 (${lap})。`,
      });
    case RaceEventType.GapClosing: {
      const gapSeconds = asNumber(event.params.gapSeconds);
      const ahead = asString(event.params.aheadDriverCode, "");

      // 간격 정보가 없으면 기존 문구로 폴백한다.
      if (gapSeconds === null) {
        return pick(locale, {
          en: `${driver} is closing the gap ahead.`,
          ko: `${driver}가 앞차와의 간격을 좁히고 있습니다.`,
          ja: `${driver} が前車との差を詰めています。`,
        });
      }

      const gapText = gapSeconds.toFixed(1);

      // 앞차 코드는 없을 수 있다.
      if (ahead.length === 0) {
        return pick(locale, {
          en: `${driver} has closed to within ${gapText}s of the car ahead.`,
          ko: `${driver}가 앞차와 ${gapText}초 차로 좁혔습니다.`,
          ja: `${driver} が前車との差を${gapText}秒に詰めました。`,
        });
      }

      return pick(locale, {
        en: `${driver} is chasing ${ahead}, ${gapText}s behind.`,
        ko: `${driver}가 ${gapText}초 차로 ${ahead}을 추격 중입니다.`,
        ja: `${driver} が${gapText}秒差で ${ahead} を追走中。`,
      });
    }
    case RaceEventType.GapIncreasing:
      return pick(locale, {
        en: `${driver} is losing ground.`,
        ko: `${driver}가 간격이 벌어지고 있습니다.`,
        ja: `${driver} が差を広げられています。`,
      });
    case RaceEventType.OverrideRangeEntered:
      return pick(locale, {
        en: `${driver} is within 1s of ${target} — overtake mode available.`,
        ko: `${driver}가 ${target} 뒤 1초 이내로 붙어 오버테이크 모드 사정권에 들어왔습니다.`,
        ja: `${driver} が ${target} の1秒以内に接近し、オーバーテイクモード圏内に入りました。`,
      });
    case RaceEventType.YellowFlag:
      return pick(locale, {
        en: "Yellow flag on track.",
        ko: "트랙에 옐로 플래그가 발동되었습니다.",
        ja: "コースにイエローフラッグ。",
      });
    case RaceEventType.GreenFlag:
      return pick(locale, {
        en: "Green flag.",
        ko: "그린 플래그.",
        ja: "グリーンフラッグ。",
      });
    case RaceEventType.SafetyCar:
      return pick(locale, {
        en: "Safety Car deployed.",
        ko: "세이프티카가 출동했습니다.",
        ja: "セーフティカー導入。",
      });
    case RaceEventType.VirtualSafetyCar:
      return pick(locale, {
        en: "Virtual Safety Car deployed.",
        ko: "버추얼 세이프티카가 발동되었습니다.",
        ja: "バーチャルセーフティカー導入。",
      });
    case RaceEventType.RedFlag:
      return pick(locale, {
        en: "Red flag — session stopped.",
        ko: "레드 플래그 — 세션이 중단되었습니다.",
        ja: "レッドフラッグ — セッション中断。",
      });
    case RaceEventType.Retirement: {
      // 생성 측이 `RetirementReason` enum 값(dnf / dns / dsq)을 담는다.
      const cause = asString(event.params.reason, "");

      if (cause === RetirementReason.Dns) {
        return pick(locale, {
          en: `${driver} did not start.`,
          ko: `${driver}가 출발하지 못했습니다.`,
          ja: `${driver} はスタートできませんでした。`,
        });
      }

      if (cause === RetirementReason.Dsq) {
        return pick(locale, {
          en: `${driver} was disqualified.`,
          ko: `${driver}가 실격되었습니다.`,
          ja: `${driver} は失格となりました。`,
        });
      }

      return pick(locale, {
        en: `${driver} has retired.`,
        ko: `${driver}가 리타이어했습니다.`,
        ja: `${driver} がリタイア。`,
      });
    }
    case RaceEventType.StrategyNote:
      return pick(locale, {
        en: `Strategy note: ${driver} may have an undercut window.`,
        ko: `전략 노트: ${driver}에게 언더컷 기회가 있을 수 있습니다.`,
        ja: `戦略メモ: ${driver} にアンダーカットのチャンスがあるかもしれません。`,
      });
    case RaceEventType.Penalty: {
      const seconds = asNumber(event.params.penaltySeconds);
      const suffix = reasonSuffix(asString(event.params.reason, ""), locale);
      // 페널티도 다중 차량일 수 있다. driverCode(첫 차량)만 읽으면 나머지가 누락된다.
      const codes = asDriverCodes(event.params);
      const codeText = codes.length > 0 ? codes.join(", ") : driver;

      if (seconds === null) {
        return pick(locale, {
          en: `${codeText} received a penalty${suffix}.`,
          ko: `${codeText}에게 페널티가 부과되었습니다${suffix}.`,
          ja: `${codeText} にペナルティ${suffix}。`,
        });
      }

      return pick(locale, {
        en: `${codeText} received a ${seconds}-second penalty${suffix}.`,
        ko: `${codeText}에게 ${seconds}초 페널티가 부과되었습니다${suffix}.`,
        ja: `${codeText} に ${seconds}秒ペナルティ${suffix}。`,
      });
    }
    case RaceEventType.Investigation: {
      // F1 에서 NOTED 는 인시던트 "접수"이지 종결이 아니다. 3-상태를 구분해 번역하고,
      // 어느 상태든 사유 접미사를 유지한다(핵심 정보가 사라지지 않도록).
      const codes = asDriverCodes(event.params);
      const suffix = reasonSuffix(asString(event.params.reason, ""), locale);
      const status = asString(event.params.status, "");
      const codeText = codes.join(", ");
      const hasCodes = codes.length > 0;
      // 대상 차량이 없을 수 있으므로 "관련" 절을 로케일별로 분리해 조립한다.
      const enInvolving = hasCodes ? ` involving ${codeText}` : "";
      const koPrefix = hasCodes ? `${codeText} 관련 ` : "";
      const jaPrefix = hasCodes ? `${codeText} に関する` : "";

      if (status === InvestigationStatus.Noted) {
        return pick(locale, {
          en: `An incident${enInvolving} has been noted${suffix}.`,
          ko: `${koPrefix}인시던트가 접수되었습니다${suffix}.`,
          ja: `${jaPrefix}インシデントが受理されました${suffix}。`,
        });
      }

      if (status === InvestigationStatus.UnderInvestigation) {
        return pick(locale, {
          en: `An incident${enInvolving} is under investigation${suffix}.`,
          ko: `${koPrefix}인시던트가 조사 중입니다${suffix}.`,
          ja: `${jaPrefix}インシデントが審議中です${suffix}。`,
        });
      }

      if (status === InvestigationStatus.Concluded) {
        return pick(locale, {
          en: `The investigation${enInvolving} has concluded${suffix}.`,
          ko: `${koPrefix}조사가 종료되었습니다${suffix}.`,
          ja: `${jaPrefix}審議が終了しました${suffix}。`,
        });
      }

      // status 가 없거나 알 수 없는 값 — 진행 상태를 단정하지 않는 중립 문구.
      return pick(locale, {
        en: `An incident${enInvolving} was reported${suffix}.`,
        ko: `${koPrefix}인시던트가 보고되었습니다${suffix}.`,
        ja: `${jaPrefix}インシデントが報告されました${suffix}。`,
      });
    }
    case RaceEventType.TrackLimits: {
      const turn = asNumber(event.params.turn);

      if (turn === null) {
        return pick(locale, {
          en: `${driver} exceeded track limits.`,
          ko: `${driver}가 트랙 리밋을 위반했습니다.`,
          ja: `${driver} がトラックリミット違反。`,
        });
      }

      return pick(locale, {
        en: `${driver} exceeded track limits at Turn ${turn}.`,
        ko: `${driver}가 ${turn}번 코너에서 트랙 리밋을 위반했습니다.`,
        ja: `${driver} がターン${turn}でトラックリミット違反。`,
      });
    }
    case RaceEventType.BlueFlag:
      return pick(locale, {
        en: `Blue flag for ${driver}.`,
        ko: `${driver}에게 블루 플래그가 제시되었습니다.`,
        ja: `${driver} にブルーフラッグ。`,
      });
    case RaceEventType.SectorYellow: {
      const sector = asNumber(event.params.sector);
      const isDouble = event.params.double === true;

      if (sector === null) {
        return isDouble
          ? pick(locale, {
              en: "Double yellow on track.",
              ko: "트랙에 더블 옐로가 발동되었습니다.",
              ja: "コースにダブルイエロー。",
            })
          : pick(locale, {
              en: "Yellow flag on track.",
              ko: "트랙에 옐로 플래그가 발동되었습니다.",
              ja: "コースにイエローフラッグ。",
            });
      }

      if (isDouble) {
        return pick(locale, {
          en: `Double yellow in sector ${sector}.`,
          ko: `${sector}섹터에 더블 옐로가 발동되었습니다.`,
          ja: `セクター${sector} にダブルイエロー。`,
        });
      }

      return pick(locale, {
        en: `Yellow flag in sector ${sector}.`,
        ko: `${sector}섹터에 옐로 플래그가 발동되었습니다.`,
        ja: `セクター${sector} にイエローフラッグ。`,
      });
    }
    case RaceEventType.SectorClear: {
      const sector = asNumber(event.params.sector);

      if (sector === null) {
        return pick(locale, {
          en: "Track is clear.",
          ko: "트랙이 정상화되었습니다.",
          ja: "コースがクリアになりました。",
        });
      }

      return pick(locale, {
        en: `Sector ${sector} is clear.`,
        ko: `${sector}섹터가 정상화되었습니다.`,
        ja: `セクター${sector} がクリアになりました。`,
      });
    }
    case RaceEventType.ChequeredFlag:
      return pick(locale, {
        en: "Chequered flag — the race is over.",
        ko: "체커기 — 경기가 종료되었습니다.",
        ja: "チェッカーフラッグ — レース終了。",
      });
    case RaceEventType.OvertakeModeEnabled:
      // OpenF1 원문은 `OVERTAKE ENABLED`. 2026 규정에서는 DRS 가 아니라
      // 매뉴얼 오버라이드(전기 부스트) 사용 가능 구간을 뜻한다.
      return pick(locale, {
        en: "Overtake mode available.",
        ko: "오버테이크 모드를 사용할 수 있습니다.",
        ja: "オーバーテイクモードが使用可能になりました。",
      });
    case RaceEventType.OvertakeModeDisabled:
      return pick(locale, {
        en: "Overtake mode unavailable.",
        ko: "오버테이크 모드를 사용할 수 없습니다.",
        ja: "オーバーテイクモードが使用できなくなりました。",
      });
    case RaceEventType.TrackHazard: {
      const noun = pick(
        locale,
        getHazardNoun(asString(event.params.kind, "")),
      );
      const turn = asNumber(event.params.turn);

      if (turn === null) {
        return pick(locale, {
          en: `${noun} on track — take care.`,
          ko: `트랙에 ${noun} — 주의가 필요합니다.`,
          ja: `コース上に${noun} — 注意。`,
        });
      }

      return pick(locale, {
        en: `${noun} on track at Turn ${turn}.`,
        ko: `${turn}번 코너에 ${noun} — 주의가 필요합니다.`,
        ja: `ターン${turn}に${noun} — 注意。`,
      });
    }
    case RaceEventType.PitLaneClosed:
      return pick(locale, {
        en: "Pit exit closed.",
        ko: "피트 출구가 폐쇄되었습니다.",
        ja: "ピット出口が閉鎖されました。",
      });
    case RaceEventType.PitLaneOpen:
      return pick(locale, {
        en: "Pit exit open.",
        ko: "피트 출구가 개방되었습니다.",
        ja: "ピット出口が開放されました。",
      });
    case RaceEventType.RainRisk: {
      const percent = asNumber(event.params.percent);

      if (percent === null) {
        return pick(locale, {
          en: "There is a chance of rain.",
          ko: "비가 올 가능성이 있습니다.",
          ja: "雨の可能性があります。",
        });
      }

      return pick(locale, {
        en: `Rain risk is ${percent}%.`,
        ko: `강수 확률은 ${percent}% 입니다.`,
        ja: `降水確率は ${percent}% です。`,
      });
    }
    case RaceEventType.OvertakeForecast: {
      // 배틀 진입 예측(docs/23). params 는 driverCode(chaser)·targetDriverCode(target)·
      // predictedLapsToBattle 를 싣는다.
      const laps = asNumber(event.params.predictedLapsToBattle);

      // 옛 이벤트·결손이면 기존 fallback 으로 안전하게 처리한다.
      if (driver.length === 0 || target.length === 0 || laps === null) {
        return pick(locale, {
          en: "Race update.",
          ko: "경기 업데이트.",
          ja: "レース更新。",
        });
      }

      // 1랩은 en 단수("1 lap"). ko·ja 는 단복수 구분이 없다.
      const enLaps = laps === 1 ? "1 lap" : `${laps} laps`;

      // 조사를 피하려 드라이버 코드 뒤에는 쉼표를 쓴다(기존 이벤트 번역 관례).
      return pick(locale, {
        en: `${driver} expected within 1s of ${target} in ${enLaps}.`,
        ko: `${driver}, ${laps}랩 후 ${target} 1초 내 진입 예상.`,
        ja: `${driver}、${laps}周後に ${target} の1秒以内に接近する見込み。`,
      });
    }
    case RaceEventType.TeamRadioPosted:
      return pick(locale, {
        en: `New team radio from ${driver}.`,
        ko: `${driver}의 팀 라디오가 도착했습니다.`,
        ja: `${driver} のチームラジオが届きました。`,
      });
    default:
      // 알 수 없는 이벤트 — raw JSON 대신 fallback.
      return pick(locale, {
        en: "Race update.",
        ko: "경기 업데이트.",
        ja: "レース更新。",
      });
  }
};
