import {
  AiConfidence,
  DataFreshnessStatus,
  DataMode,
  ExplanationLevel,
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
    lapSeparator: string;
    session: string;
    connection: string;
    mode: string;
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
    title: string;
    air: string;
    track: string;
    humidity: string;
    wind: string;
    rain: string;
    dry: string;
  };
  events: {
    title: string;
    empty: string;
  };
  teamRadio: {
    title: string;
    empty: string;
    play: string;
    pause: string;
  };
  favoriteCard: {
    title: string;
    empty: string;
    start: string;
    ahead: string;
    behind: string;
    recentPace: string;
    pitStops: string;
    recentEvents: string;
    noEvents: string;
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
  status: Record<SessionStatus, string>;
  freshness: Record<DataFreshnessStatus, string>;
  mode: Record<DataMode, string>;
  compound: Record<TireCompound, string>;
  localeName: Record<SupportedLocale, string>;
};

const en: Dictionary = {
  appName: "F1 AI Second Screen",
  tagline: "Understand the race in real time",
  header: {
    lap: "Lap",
    lapSeparator: "of",
    session: "Session",
    connection: "Connection",
    mode: "Mode",
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
    title: "Track Conditions",
    air: "Air",
    track: "Track",
    humidity: "Humidity",
    wind: "Wind",
    rain: "Rain",
    dry: "Dry",
  },
  events: {
    title: "Recent Events",
    empty: "No events yet",
  },
  teamRadio: {
    title: "Team Radio",
    empty: "No radio messages yet",
    play: "Play",
    pause: "Pause",
  },
  favoriteCard: {
    title: "Favorite Drivers",
    empty: "Tap the star next to a driver to follow them here.",
    start: "Start",
    ahead: "Ahead",
    behind: "Behind",
    recentPace: "Recent Pace",
    pitStops: "Pit Stops",
    recentEvents: "Recent",
    noEvents: "No recent events",
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
  freshness: {
    [DataFreshnessStatus.Live]: "Live",
    [DataFreshnessStatus.Delayed]: "Delayed",
    [DataFreshnessStatus.Stale]: "Stale",
    [DataFreshnessStatus.Unknown]: "Unknown",
  },
  mode: {
    [DataMode.Mock]: "Mock",
    [DataMode.Replay]: "Replay",
    [DataMode.Live]: "Live",
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
    lapSeparator: "/",
    session: "세션",
    connection: "연결",
    mode: "모드",
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
    title: "트랙 컨디션",
    air: "기온",
    track: "노면",
    humidity: "습도",
    wind: "바람",
    rain: "강수",
    dry: "건조",
  },
  events: {
    title: "최근 이벤트",
    empty: "아직 이벤트가 없습니다",
  },
  teamRadio: {
    title: "팀 라디오",
    empty: "아직 무전이 없습니다",
    play: "재생",
    pause: "정지",
  },
  favoriteCard: {
    title: "관심 드라이버",
    empty: "드라이버 옆의 별을 눌러 여기에 추가하세요.",
    start: "출발",
    ahead: "앞차",
    behind: "뒤차",
    recentPace: "최근 페이스",
    pitStops: "피트 횟수",
    recentEvents: "최근 이벤트",
    noEvents: "최근 이벤트가 없습니다",
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
  freshness: {
    [DataFreshnessStatus.Live]: "실시간",
    [DataFreshnessStatus.Delayed]: "지연",
    [DataFreshnessStatus.Stale]: "오래됨",
    [DataFreshnessStatus.Unknown]: "알 수 없음",
  },
  mode: {
    [DataMode.Mock]: "목업",
    [DataMode.Replay]: "리플레이",
    [DataMode.Live]: "라이브",
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
    lapSeparator: "/",
    session: "セッション",
    connection: "接続",
    mode: "モード",
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
    title: "トラックコンディション",
    air: "気温",
    track: "路面",
    humidity: "湿度",
    wind: "風",
    rain: "降水",
    dry: "ドライ",
  },
  events: {
    title: "最近のイベント",
    empty: "まだイベントがありません",
  },
  teamRadio: {
    title: "チームラジオ",
    empty: "まだ無線がありません",
    play: "再生",
    pause: "停止",
  },
  favoriteCard: {
    title: "お気に入りドライバー",
    empty: "ドライバー横の星をタップしてここに追加できます。",
    start: "スタート",
    ahead: "前車",
    behind: "後車",
    recentPace: "最近のペース",
    pitStops: "ピット回数",
    recentEvents: "最近のイベント",
    noEvents: "最近のイベントはありません",
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
  freshness: {
    [DataFreshnessStatus.Live]: "ライブ",
    [DataFreshnessStatus.Delayed]: "遅延",
    [DataFreshnessStatus.Stale]: "古い",
    [DataFreshnessStatus.Unknown]: "不明",
  },
  mode: {
    [DataMode.Mock]: "モック",
    [DataMode.Replay]: "リプレイ",
    [DataMode.Live]: "ライブ",
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
