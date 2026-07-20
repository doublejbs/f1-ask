import {
  AiConfidence,
  DataFreshnessStatus,
  ExplanationLevel,
  RaceEventPriority,
  SessionStateSeverity,
  SessionStatus,
  SupportedLocale,
  TireCompound,
} from "@f1/domain";

// UI 정적 문자열 사전. locale 별로 완전한 사전을 제공한다.
export type Dictionary = {
  appName: string;
  tagline: string;
  header: {
    lap: string;
    session: string;
  };
  table: {
    title: string;
    tire: string;
    favorite: string;
    leader: string;
    inPit: string;
    retired: string;
    lapsUnit: string;
  };
  weather: {
    rain: string;
    dry: string;
  };
  events: {
    title: string;
    empty: string;
    filterLabel: string;
    filterPrimary: string;
    filterAll: string;
    // {count} 를 숨겨진 이벤트 수로 치환한다.
    hiddenCount: string;
    // 이벤트에 붙는 AI 해설 줄.
    commentaryExpand: string;
    commentaryCollapse: string;
    // 드라이버 필터가 걸렸는데 해당 이벤트가 없을 때.
    emptyForDriver: string;
    // 필터 칩의 해제 버튼 접근성 라벨. {code} 를 드라이버 코드로 치환한다.
    driverFilterClear: string;
  };
  teamRadio: {
    title: string;
    // {code} 를 드라이버 코드로 치환하는 재생/일시정지 접근성 라벨.
    play: string;
    pause: string;
    // 최근(2분 이내) 무전 강조 아이콘의 툴팁.
    recent: string;
  };
  askAi: {
    title: string;
    placeholder: string;
    ask: string;
    thinking: string;
    error: string;
    insufficient: string;
    suggestions: string;
    confidenceLabel: string;
    reset: string;
    emptyHint: string;
    // {code} 를 드라이버 코드로 치환하는 탭투애스크 질문 템플릿.
    driverTapQuestion: string;
    confidence: Record<AiConfidence, string>;
  };
  explanationLevel: {
    label: string;
    levels: Record<ExplanationLevel, string>;
  };
  summary: {
    title: string;
    winner: string;
    podium: string;
    fastestLap: string;
    overtakes: string;
    pitStops: string;
    retirements: string;
  };
  statusBar: {
    appShort: string;
    settings: string;
  };
  tabs: {
    race: string;
    ask: string;
  };
  eventSheet: {
    // 논모달 이벤트 시트의 aria-label.
    label: string;
    // 그랩 핸들 버튼의 접근성 라벨(탭하면 다음 단계로 순환).
    handle: string;
  };
  settings: {
    title: string;
    close: string;
    circuit: string;
  };
  driverSheet: {
    favorites: string;
    leadGap: string;
    ahead: string;
    lastLap: string;
    sectors: string;
    topSpeed: string;
    pitStops: string;
    // {code} 를 드라이버 코드로 치환하는 시트 하단 AI 질문 버튼 라벨.
    ask: string;
    close: string;
    // {code} 의 이벤트만 보도록 이벤트 피드를 좁히는 액션.
    filterEvents: string;
  };
  battles: {
    // 매뉴얼 오버라이드 사정권 소형 라벨. 칩 폭이 좁아 축약어를 쓴다.
    overtakeLabel: string;
    // 위 축약 라벨의 풀네임. title / aria-label 로 의미를 전달한다.
    overtakeTitle: string;
    // 순위 행 인라인 배틀의 스크린리더 문구. 색 강조만으로 전달되지 않게 보완한다.
    // {code} 는 상대 드라이버 코드, {gap} 은 소수 1자리 간격(초).
    chasingDescription: string;
    aheadDescription: string;
  };
  criticalBanner: {
    // 배너 닫기 버튼 접근성 라벨.
    dismiss: string;
  };
  // 상단 활성 세션 상태 스트립 (docs/14-event-placement.md).
  // 칩 라벨 자체는 params 가 필요해 TranslateSessionState 가 담당하고,
  // 여기에는 정적 크롬 문구만 둔다.
  sessionStrip: {
    // 스트립 전체의 접근성 라벨.
    title: string;
    // 칩이 색에만 의존하지 않도록 title/aria-label 에 덧붙이는 심각도 문구.
    severity: Record<SessionStateSeverity, string>;
  };
  // 순위 행의 지속 마커·순간 아이콘 접근성 문구 (docs/14-event-placement.md).
  // 칩에 보이는 글자(`+5s` / `PEN` / `?`)는 기호라 로케일과 무관하고,
  // 의미는 여기 문구가 title/aria-label 로 전달한다.
  rowMarker: {
    // 페널티 1건. {seconds} 를 초로 치환한다.
    penalty: string;
    // 페널티 누적. {count} 건수, {seconds} 합산 초.
    penaltyMultiple: string;
    // 초를 알 수 없는 페널티.
    penaltyUnknown: string;
    investigation: string;
    pitStop: string;
    fastestLap: string;
    personalBestLap: string;
    overtake: string;
    trackLimits: string;
    strategyNote: string;
    blueFlag: string;
  };
  // 최신 이벤트 카드 (docs/14-event-placement.md).
  latestEvent: {
    // 카드 전체의 접근성 라벨.
    title: string;
    // 탭 가능한 카드의 힌트. {code} 를 드라이버 코드로 치환한다.
    openDriver: string;
  };
  status: Record<SessionStatus, string>;
  // 이벤트 우선순위 배지 라벨. enum 원문(critical/high/…)이 UI 에 노출되지 않도록 번역한다.
  eventPriority: Record<RaceEventPriority, string>;
  freshness: Record<DataFreshnessStatus, string>;
  compound: Record<TireCompound, string>;
  localeName: Record<SupportedLocale, string>;
};

const en: Dictionary = {
  appName: "F1 AI Second Screen",
  tagline: "Understand the race in real time",
  header: {
    lap: "Lap",
    session: "Session",
  },
  table: {
    title: "Standings",
    tire: "Tire",
    favorite: "Favorite",
    leader: "Leader",
    inPit: "IN PIT",
    retired: "OUT",
    lapsUnit: "L",
  },
  weather: {
    rain: "Rain",
    dry: "Dry",
  },
  events: {
    title: "Recent Events",
    empty: "No events yet",
    filterLabel: "Priority filter",
    filterPrimary: "Key",
    filterAll: "All",
    hiddenCount: "{count} more hidden",
    commentaryExpand: "More",
    commentaryCollapse: "Less",
    emptyForDriver: "No events for this driver yet",
    driverFilterClear: "Clear {code} event filter",
  },
  teamRadio: {
    title: "Team Radio",
    play: "Play {code} team radio",
    pause: "Pause {code} team radio",
    recent: "New radio",
  },
  askAi: {
    title: "Ask AI",
    placeholder: "Ask about the race…",
    ask: "Ask",
    thinking: "Thinking…",
    error: "Something went wrong. Please try again.",
    insufficient: "Not enough data to answer confidently.",
    suggestions: "Try asking",
    confidenceLabel: "Confidence",
    reset: "New chat",
    emptyHint: "Ask a question, or tap a driver or event below.",
    driverTapQuestion: "How is {code} doing right now?",
    confidence: {
      [AiConfidence.Low]: "Low",
      [AiConfidence.Medium]: "Medium",
      [AiConfidence.High]: "High",
    },
  },
  explanationLevel: {
    label: "Explanation",
    levels: {
      [ExplanationLevel.Beginner]: "Beginner",
      [ExplanationLevel.Standard]: "Standard",
      [ExplanationLevel.Expert]: "Expert",
    },
  },
  summary: {
    title: "Race Summary",
    winner: "Winner",
    podium: "Podium",
    fastestLap: "Fastest Lap",
    overtakes: "Overtakes",
    pitStops: "Pit Stops",
    retirements: "Retirements",
  },
  statusBar: {
    appShort: "F1 AI",
    settings: "Settings",
  },
  tabs: {
    race: "Race",
    ask: "AI",
  },
  eventSheet: {
    label: "Recent events",
    handle: "Resize the events sheet",
  },
  settings: {
    title: "Settings",
    close: "Close",
    circuit: "Circuit",
  },
  driverSheet: {
    favorites: "Favorites",
    leadGap: "Gap to Leader",
    ahead: "Interval",
    lastLap: "Last Lap",
    sectors: "Sectors",
    topSpeed: "Top Speed",
    pitStops: "Pit Stops",
    ask: "Ask AI about {code}",
    close: "Close",
    filterEvents: "Show only {code} events",
  },
  battles: {
    overtakeLabel: "OT",
    overtakeTitle: "Overtake mode available",
    chasingDescription: "Battling {code} ahead, {gap}s gap",
    aheadDescription: "Battling {code} behind, {gap}s gap",
  },
  criticalBanner: {
    dismiss: "Dismiss",
  },
  sessionStrip: {
    title: "Active race status",
    severity: {
      [SessionStateSeverity.Critical]: "Session stopped",
      [SessionStateSeverity.High]: "Race neutralised",
      [SessionStateSeverity.Caution]: "Caution",
      [SessionStateSeverity.Info]: "Information",
    },
  },
  rowMarker: {
    penalty: "{seconds}s time penalty",
    penaltyMultiple: "{count} penalties, {seconds}s total",
    penaltyUnknown: "Time penalty",
    investigation: "Under investigation",
    pitStop: "Just pitted",
    fastestLap: "Fastest lap",
    personalBestLap: "Personal best lap",
    overtake: "Just overtook",
    trackLimits: "Track limits",
    strategyNote: "Strategy note",
    blueFlag: "Blue flag",
  },
  latestEvent: {
    title: "Latest key event",
    openDriver: "Open {code} details",
  },
  status: {
    [SessionStatus.Scheduled]: "Scheduled",
    [SessionStatus.Green]: "Green Flag",
    [SessionStatus.Yellow]: "Yellow Flag",
    [SessionStatus.SafetyCar]: "Safety Car",
    [SessionStatus.VirtualSafetyCar]: "Virtual Safety Car",
    [SessionStatus.Red]: "Red Flag",
    [SessionStatus.Suspended]: "Suspended",
    [SessionStatus.Finished]: "Finished",
    [SessionStatus.Unknown]: "Unknown",
  },
  eventPriority: {
    [RaceEventPriority.Critical]: "Critical",
    [RaceEventPriority.High]: "High",
    [RaceEventPriority.Medium]: "Medium",
    [RaceEventPriority.Low]: "Low",
  },
  freshness: {
    [DataFreshnessStatus.Live]: "Live",
    [DataFreshnessStatus.Delayed]: "Delayed",
    [DataFreshnessStatus.Stale]: "Stale",
    [DataFreshnessStatus.Unknown]: "Unknown",
  },
  compound: {
    [TireCompound.Soft]: "Soft",
    [TireCompound.Medium]: "Medium",
    [TireCompound.Hard]: "Hard",
    [TireCompound.Intermediate]: "Inter",
    [TireCompound.Wet]: "Wet",
    [TireCompound.Unknown]: "—",
  },
  localeName: {
    [SupportedLocale.En]: "English",
    [SupportedLocale.Ko]: "한국어",
    [SupportedLocale.Ja]: "日本語",
  },
};

const ko: Dictionary = {
  appName: "F1 AI 세컨드 스크린",
  tagline: "실시간으로 경기를 이해하세요",
  header: {
    lap: "랩",
    session: "세션",
  },
  table: {
    title: "순위",
    tire: "타이어",
    favorite: "관심",
    leader: "선두",
    inPit: "피트인",
    retired: "리타이어",
    lapsUnit: "랩",
  },
  weather: {
    rain: "강수",
    dry: "건조",
  },
  events: {
    title: "최근 이벤트",
    empty: "아직 이벤트가 없습니다",
    filterLabel: "우선순위 필터",
    filterPrimary: "주요",
    filterAll: "전체",
    hiddenCount: "그 외 {count}건",
    commentaryExpand: "더 보기",
    commentaryCollapse: "접기",
    emptyForDriver: "이 드라이버의 이벤트가 없습니다",
    driverFilterClear: "{code} 이벤트 필터 해제",
  },
  teamRadio: {
    title: "팀 라디오",
    play: "{code} 팀 라디오 재생",
    pause: "{code} 팀 라디오 일시정지",
    recent: "새 무전",
  },
  askAi: {
    title: "AI에게 질문",
    placeholder: "경기에 대해 물어보세요…",
    ask: "질문",
    thinking: "생각 중…",
    error: "문제가 발생했습니다. 다시 시도해 주세요.",
    insufficient: "확실히 답하기에는 데이터가 부족합니다.",
    suggestions: "이렇게 물어보세요",
    confidenceLabel: "신뢰도",
    reset: "새 대화",
    emptyHint: "질문을 입력하거나 아래 드라이버·이벤트를 탭해 보세요.",
    driverTapQuestion: "{code} 지금 상황 어때?",
    confidence: {
      [AiConfidence.Low]: "낮음",
      [AiConfidence.Medium]: "보통",
      [AiConfidence.High]: "높음",
    },
  },
  explanationLevel: {
    label: "설명 수준",
    levels: {
      [ExplanationLevel.Beginner]: "입문",
      [ExplanationLevel.Standard]: "표준",
      [ExplanationLevel.Expert]: "숙련",
    },
  },
  summary: {
    title: "경기 요약",
    winner: "우승",
    podium: "포디움",
    fastestLap: "패스티스트 랩",
    overtakes: "추월",
    pitStops: "피트스톱",
    retirements: "리타이어",
  },
  statusBar: {
    appShort: "F1 AI",
    settings: "설정",
  },
  tabs: {
    race: "경기",
    ask: "AI",
  },
  eventSheet: {
    label: "최근 이벤트",
    handle: "이벤트 시트 크기 조절",
  },
  settings: {
    title: "설정",
    close: "닫기",
    circuit: "서킷",
  },
  driverSheet: {
    favorites: "관심 드라이버",
    leadGap: "선두 갭",
    ahead: "앞차",
    lastLap: "최근 랩",
    sectors: "섹터",
    topSpeed: "최고속",
    pitStops: "피트",
    ask: "{code}에 대해 AI에게 질문",
    close: "닫기",
    filterEvents: "{code} 이벤트만 보기",
  },
  battles: {
    overtakeLabel: "OT",
    overtakeTitle: "오버테이크 모드 사용 가능",
    chasingDescription: "앞차 {code}와 {gap}초 차 접전",
    aheadDescription: "뒤차 {code}와 {gap}초 차 접전",
  },
  criticalBanner: {
    dismiss: "닫기",
  },
  sessionStrip: {
    title: "현재 경기 상태",
    severity: {
      [SessionStateSeverity.Critical]: "세션 중단",
      [SessionStateSeverity.High]: "경기 중립화",
      [SessionStateSeverity.Caution]: "주의",
      [SessionStateSeverity.Info]: "정보",
    },
  },
  rowMarker: {
    penalty: "{seconds}초 페널티",
    penaltyMultiple: "페널티 {count}건, 합계 {seconds}초",
    penaltyUnknown: "시간 페널티",
    investigation: "조사 중",
    pitStop: "방금 피트인",
    fastestLap: "패스티스트 랩",
    personalBestLap: "개인 최고 랩",
    overtake: "방금 추월",
    trackLimits: "트랙 리밋 위반",
    strategyNote: "전략 노트",
    blueFlag: "블루 플래그",
  },
  latestEvent: {
    title: "최신 주요 이벤트",
    openDriver: "{code} 상세 열기",
  },
  status: {
    [SessionStatus.Scheduled]: "예정",
    [SessionStatus.Green]: "그린 플래그",
    [SessionStatus.Yellow]: "옐로 플래그",
    [SessionStatus.SafetyCar]: "세이프티카",
    [SessionStatus.VirtualSafetyCar]: "버추얼 세이프티카",
    [SessionStatus.Red]: "레드 플래그",
    [SessionStatus.Suspended]: "중단",
    [SessionStatus.Finished]: "종료",
    [SessionStatus.Unknown]: "알 수 없음",
  },
  eventPriority: {
    [RaceEventPriority.Critical]: "중대",
    [RaceEventPriority.High]: "높음",
    [RaceEventPriority.Medium]: "보통",
    [RaceEventPriority.Low]: "낮음",
  },
  freshness: {
    [DataFreshnessStatus.Live]: "실시간",
    [DataFreshnessStatus.Delayed]: "지연",
    [DataFreshnessStatus.Stale]: "오래됨",
    [DataFreshnessStatus.Unknown]: "알 수 없음",
  },
  compound: {
    [TireCompound.Soft]: "소프트",
    [TireCompound.Medium]: "미디엄",
    [TireCompound.Hard]: "하드",
    [TireCompound.Intermediate]: "인터",
    [TireCompound.Wet]: "웻",
    [TireCompound.Unknown]: "—",
  },
  localeName: {
    [SupportedLocale.En]: "English",
    [SupportedLocale.Ko]: "한국어",
    [SupportedLocale.Ja]: "日本語",
  },
};

const ja: Dictionary = {
  appName: "F1 AI セカンドスクリーン",
  tagline: "レースをリアルタイムで理解する",
  header: {
    lap: "ラップ",
    session: "セッション",
  },
  table: {
    title: "順位",
    tire: "タイヤ",
    favorite: "お気に入り",
    leader: "首位",
    inPit: "ピットイン",
    retired: "リタイア",
    lapsUnit: "周",
  },
  weather: {
    rain: "降水",
    dry: "ドライ",
  },
  events: {
    title: "最近のイベント",
    empty: "まだイベントがありません",
    filterLabel: "優先度フィルター",
    filterPrimary: "主要",
    filterAll: "すべて",
    hiddenCount: "他 {count}件",
    commentaryExpand: "もっと見る",
    commentaryCollapse: "閉じる",
    emptyForDriver: "このドライバーのイベントはありません",
    driverFilterClear: "{code} イベントフィルターを解除",
  },
  teamRadio: {
    title: "チームラジオ",
    play: "{code} チームラジオを再生",
    pause: "{code} チームラジオを一時停止",
    recent: "新着無線",
  },
  askAi: {
    title: "AIに質問",
    placeholder: "レースについて質問…",
    ask: "質問",
    thinking: "考え中…",
    error: "問題が発生しました。もう一度お試しください。",
    insufficient: "確実に答えるにはデータが不足しています。",
    suggestions: "質問例",
    confidenceLabel: "信頼度",
    reset: "新しい会話",
    emptyHint: "質問を入力するか、下のドライバー・イベントをタップしてください。",
    driverTapQuestion: "{code} は今どんな状況？",
    confidence: {
      [AiConfidence.Low]: "低",
      [AiConfidence.Medium]: "中",
      [AiConfidence.High]: "高",
    },
  },
  explanationLevel: {
    label: "解説レベル",
    levels: {
      [ExplanationLevel.Beginner]: "初級",
      [ExplanationLevel.Standard]: "標準",
      [ExplanationLevel.Expert]: "上級",
    },
  },
  summary: {
    title: "レース要約",
    winner: "優勝",
    podium: "表彰台",
    fastestLap: "ファステストラップ",
    overtakes: "オーバーテイク",
    pitStops: "ピットストップ",
    retirements: "リタイア",
  },
  statusBar: {
    appShort: "F1 AI",
    settings: "設定",
  },
  tabs: {
    race: "レース",
    ask: "AI",
  },
  eventSheet: {
    label: "最近のイベント",
    handle: "イベントシートのサイズ変更",
  },
  settings: {
    title: "設定",
    close: "閉じる",
    circuit: "サーキット",
  },
  driverSheet: {
    favorites: "お気に入り",
    leadGap: "トップ差",
    ahead: "前車差",
    lastLap: "最終ラップ",
    sectors: "セクター",
    topSpeed: "最高速",
    pitStops: "ピット回数",
    ask: "{code} についてAIに質問",
    close: "閉じる",
    filterEvents: "{code} のイベントのみ表示",
  },
  battles: {
    overtakeLabel: "OT",
    overtakeTitle: "オーバーテイクモード使用可能",
    chasingDescription: "前方の{code}と{gap}秒差の接戦",
    aheadDescription: "後方の{code}と{gap}秒差の接戦",
  },
  criticalBanner: {
    dismiss: "閉じる",
  },
  sessionStrip: {
    title: "現在のレース状況",
    severity: {
      [SessionStateSeverity.Critical]: "セッション中断",
      [SessionStateSeverity.High]: "レース中立化",
      [SessionStateSeverity.Caution]: "注意",
      [SessionStateSeverity.Info]: "情報",
    },
  },
  rowMarker: {
    penalty: "{seconds}秒ペナルティ",
    penaltyMultiple: "ペナルティ{count}件、合計{seconds}秒",
    penaltyUnknown: "タイムペナルティ",
    investigation: "調査中",
    pitStop: "ピットイン直後",
    fastestLap: "ファステストラップ",
    personalBestLap: "自己ベストラップ",
    overtake: "オーバーテイク直後",
    trackLimits: "トラックリミット違反",
    strategyNote: "戦略メモ",
    blueFlag: "ブルーフラッグ",
  },
  latestEvent: {
    title: "最新の重要イベント",
    openDriver: "{code} の詳細を開く",
  },
  status: {
    [SessionStatus.Scheduled]: "予定",
    [SessionStatus.Green]: "グリーンフラッグ",
    [SessionStatus.Yellow]: "イエローフラッグ",
    [SessionStatus.SafetyCar]: "セーフティカー",
    [SessionStatus.VirtualSafetyCar]: "バーチャルセーフティカー",
    [SessionStatus.Red]: "レッドフラッグ",
    [SessionStatus.Suspended]: "中断",
    [SessionStatus.Finished]: "終了",
    [SessionStatus.Unknown]: "不明",
  },
  eventPriority: {
    [RaceEventPriority.Critical]: "重大",
    [RaceEventPriority.High]: "高",
    [RaceEventPriority.Medium]: "中",
    [RaceEventPriority.Low]: "低",
  },
  freshness: {
    [DataFreshnessStatus.Live]: "ライブ",
    [DataFreshnessStatus.Delayed]: "遅延",
    [DataFreshnessStatus.Stale]: "古い",
    [DataFreshnessStatus.Unknown]: "不明",
  },
  compound: {
    [TireCompound.Soft]: "ソフト",
    [TireCompound.Medium]: "ミディアム",
    [TireCompound.Hard]: "ハード",
    [TireCompound.Intermediate]: "インター",
    [TireCompound.Wet]: "ウェット",
    [TireCompound.Unknown]: "—",
  },
  localeName: {
    [SupportedLocale.En]: "English",
    [SupportedLocale.Ko]: "한국어",
    [SupportedLocale.Ja]: "日本語",
  },
};

const DICTIONARIES: Record<SupportedLocale, Dictionary> = {
  [SupportedLocale.En]: en,
  [SupportedLocale.Ko]: ko,
  [SupportedLocale.Ja]: ja,
};

export const getDictionary = (locale: SupportedLocale): Dictionary =>
  DICTIONARIES[locale];
