import {
  AiConfidence,
  DataFreshnessStatus,
  ExplanationLevel,
  RaceEventPriority,
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
    position: string;
    driver: string;
    team: string;
    gap: string;
    interval: string;
    tire: string;
    tireAge: string;
    lastLap: string;
    sectors: string;
    topSpeed: string;
    pit: string;
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
  };
  teamRadio: {
    title: string;
    empty: string;
    play: string;
    pause: string;
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
  commentary: {
    title: string;
    empty: string;
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
    now: string;
    standings: string;
    ask: string;
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
  };
  battles: {
    title: string;
    // DRS 사정권 소형 라벨.
    drsLabel: string;
    // {ahead}/{chasing} 를 드라이버 코드로 치환하는 배틀 탭투애스크 질문 템플릿.
    tapQuestion: string;
  };
  criticalBanner: {
    // 배너 닫기 버튼 접근성 라벨.
    dismiss: string;
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
    position: "Pos",
    driver: "Driver",
    team: "Team",
    gap: "Gap",
    interval: "Interval",
    tire: "Tire",
    tireAge: "Age",
    lastLap: "Last Lap",
    sectors: "Sectors",
    topSpeed: "Top Spd",
    pit: "Pit",
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
  },
  teamRadio: {
    title: "Team Radio",
    empty: "No radio messages yet",
    play: "Play",
    pause: "Pause",
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
  commentary: {
    title: "AI Commentary",
    empty: "AI commentary will appear as key moments happen.",
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
    now: "Now",
    standings: "Standings",
    ask: "AI",
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
  },
  battles: {
    title: "Battles",
    drsLabel: "DRS",
    tapQuestion: "How is the battle between {ahead} and {chasing}?",
  },
  criticalBanner: {
    dismiss: "Dismiss",
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
    position: "순위",
    driver: "드라이버",
    team: "팀",
    gap: "선두차",
    interval: "앞차",
    tire: "타이어",
    tireAge: "사용",
    lastLap: "최근 랩",
    sectors: "섹터",
    topSpeed: "최고속",
    pit: "피트",
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
  },
  teamRadio: {
    title: "팀 라디오",
    empty: "아직 무전이 없습니다",
    play: "재생",
    pause: "정지",
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
  commentary: {
    title: "AI 해설",
    empty: "주요 순간이 발생하면 AI 해설이 표시됩니다.",
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
    now: "지금",
    standings: "순위",
    ask: "AI",
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
  },
  battles: {
    title: "배틀",
    drsLabel: "DRS",
    tapQuestion: "{ahead}와 {chasing} 배틀 상황 어때?",
  },
  criticalBanner: {
    dismiss: "닫기",
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
    position: "位",
    driver: "ドライバー",
    team: "チーム",
    gap: "トップ差",
    interval: "前車差",
    tire: "タイヤ",
    tireAge: "使用",
    lastLap: "最終ラップ",
    sectors: "セクター",
    topSpeed: "最高速",
    pit: "ピット",
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
  },
  teamRadio: {
    title: "チームラジオ",
    empty: "まだ無線がありません",
    play: "再生",
    pause: "停止",
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
  commentary: {
    title: "AI解説",
    empty: "重要な場面が起きるとAI解説が表示されます。",
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
    now: "現在",
    standings: "順位",
    ask: "AI",
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
  },
  battles: {
    title: "バトル",
    drsLabel: "DRS",
    tapQuestion: "{ahead} と {chasing} のバトルはどんな状況？",
  },
  criticalBanner: {
    dismiss: "閉じる",
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
