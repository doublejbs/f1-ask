import {
  AiConfidence,
  ArchiveResultStatus,
  DataFreshnessStatus,
  ExplanationLevel,
  NewsCategory,
  NewsFilter,
  OvertakeForecastConfidence,
  RaceEventPriority,
  SessionStateSeverity,
  SessionStatus,
  SupportedLocale,
  TireCompound,
  WatchNowLane,
  WatchNowSignalType,
} from "@f1/domain";

// UI 정적 문자열 사전. locale 별로 완전한 사전을 제공한다.
export type Dictionary = {
  appName: string;
  tagline: string;
  // 최초 진입 온보딩 — 응원 팀 → 선수 선택 (docs 계획 §Phase 1).
  onboarding: {
    teamTitle: string;
    teamSubtitle: string;
    driverTitle: string;
    driverSubtitle: string;
    skip: string;
    back: string;
    loading: string;
    // 로스터를 불러오지 못했을 때(OpenF1 장애).
    unavailable: string;
  };
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
    // 순위 목록의 가로 스크롤 영역 접근성 라벨.
    extraColumns: string;
    // 데이터 열 헤더 라벨. 열 폭이 좁아 driverSheet 의 긴 표기 대신 축약형을 쓴다
    // (스크린리더에는 sr-only 로 driverSheet 의 긴 표기를 함께 싣는다).
    columns: {
      gap: string;
      lastLap: string;
      topSpeed: string;
      pitStops: string;
      // 섹터 열의 스크린리더 라벨. 화면 라벨은 F1 관례대로 "S1/S2/S3" 를 그대로 쓴다.
      // {n} 은 섹터 번호(1~3).
      sector: string;
    };
  };
  weather: {
    rain: string;
    dry: string;
  };
  // 날씨 전환 배너 (B3). 비 시작/트랙 건조 = 전략 급변.
  weatherTransition: {
    rainStarting: string;
    trackDrying: string;
    subtitle: string;
  };
  // 해설 캡션 탭 → 상세 시트 (docs/21-commentary-ask.md).
  // 해설 전문 · 원본 이벤트 · 그 시점 순위 · 질문을 담는다.
  commentarySheet: {
    // 캡션 카드 탭 타깃의 접근성 라벨.
    open: string;
    close: string;
    // 시트 제목.
    title: string;
    // 원본 이벤트 요약 섹션 제목("무슨 일이었나").
    sourceEvent: string;
    // 그 시점 순위 섹션 제목.
    standings: string;
    // 시점 맥락이 없는 해설(옛/replay)에서 답변이 현재 데이터 기준임을 알리는 주석.
    noContextNote: string;
    // 질문 입력 자리표시자.
    placeholder: string;
    // 질문 전송 버튼 라벨.
    ask: string;
    // 스레드가 비었을 때의 안내.
    emptyHint: string;
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
    // 모바일 AI 플로팅 버튼·패널 접근성 라벨.
    openPanel: string;
    closePanel: string;
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
    archive: string;
    news: string;
  };
  // 뉴스 탭 — 경기 전후 소식 (docs/28-news-tab.md).
  news: {
    title: string;
    // 탭이 무엇인지 한 줄로.
    subtitle: string;
    loading: string;
    empty: string;
    error: string;
    // 상단 필터 칩 라벨. enum 을 키로 써서 필터가 늘면 타입 에러로 잡힌다.
    filter: Record<NewsFilter, string>;
    // 카드의 카테고리 배지 라벨.
    category: Record<NewsCategory, string>;
  };
  // 지난 레이스 기록 (docs/17-race-archive.md).
  archive: {
    title: string;
    // 목록 상단 한 줄 설명.
    description: string;
    loading: string;
    // 목록·상세가 각각 갖는 오류 상태.
    listError: string;
    detailError: string;
    retry: string;
    empty: string;
    // 라운드 표기. {round} 를 라운드 번호로 치환한다.
    round: string;
    podium: string;
    results: string;
    timeline: string;
    // 상세로 들어가는 목록 행의 접근성 라벨. {name} 은 그랑프리명.
    openRace: string;
    back: string;
    // 최종 순위 표 헤더.
    columns: {
      position: string;
      driver: string;
      gap: string;
      laps: string;
      points: string;
    };
    // 세션 종류 라벨. OpenF1 의 session_name 원문을 키로 쓴다.
    sessionName: {
      race: string;
      sprint: string;
    };
    // 완주 상태 배지.
    status: Record<ArchiveResultStatus, string>;
  };
  // 진행 중인 세션이 없을 때의 「경기」 탭 (docs/17-race-archive.md).
  noSession: {
    connecting: string;
    title: string;
    description: string;
    action: string;
    // 세션이 없으면 AI 탭도 답할 근거가 없다.
    askUnavailable: string;
  };
  settings: {
    title: string;
    close: string;
    circuit: string;
  };
  // 계정 섹션 (docs/15-google-auth.md §UI). 설정 시트 안에서만 노출한다.
  account: {
    title: string;
    signInWithGoogle: string;
    syncDescription: string;
    signOut: string;
    signInError: string;
    // 구글 프로필에 표시 이름이 없을 때의 대체 라벨.
    anonymousName: string;
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
    // 이벤트 이력 섹션 제목 (docs/14-event-placement.md).
    eventHistory: string;
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
    // 칸에 못 올라간 "지금 볼 것" 신호의 행 표시 (docs/19 수용 기준 7).
    // 점 하나는 뜻을 전달하지 못하므로 실제 내용은 이 문구가 title/aria-label 로 옮긴다.
    // {signals} 에 신호 요약 문장들이 " · " 로 이어져 들어간다.
    watchNow: string;
  };
  // 최신 이벤트 카드 (docs/14-event-placement.md).
  latestEvent: {
    // 카드 전체의 접근성 라벨.
    title: string;
    // 탭 가능한 카드의 힌트. {code} 를 드라이버 코드로 치환한다.
    openDriver: string;
    // 위 버튼 — 더 최신 이벤트로.
    previousEvent: string;
    // 아래 버튼 — 더 과거 이벤트로.
    nextEvent: string;
    // 스크린리더용 현재 위치. {current}/{total} 을 치환한다(화면에는 "2/8" 로 압축).
    position: string;
  };
  // "지금 볼 것" — 역할이 고정된 칸 3개 (docs/19-watch-now.md §화면).
  watchNow: {
    // 섹션 헤더 겸 접근성 라벨.
    title: string;
    // 섹션이 무엇인지 한 줄로. 최신 이벤트 카드("발표된 것")와 역할을 갈라 준다.
    subtitle: string;
    // 칸 이름. enum 을 키로 써서 칸이 늘면 타입 에러로 잡힌다.
    lane: Record<WatchNowLane, string>;
    // 후보가 없는 칸에 표시한다. "접힘"(즐겨찾기 미설정)과 다르다.
    quiet: string;
    // 감지기 종류 이름. **도메인 enum 을 UI 가 번역한다** — 문자열을 컴포넌트에
    // 하드코딩하지 않는다(docs/19).
    signalType: Record<WatchNowSignalType, string>;
    // 신호 종류 안내(B5): 정보 토글 aria + 종류별 한 줄 설명.
    legendToggle: string;
    signalHelp: Record<WatchNowSignalType, string>;
    // 지난 신호(B4). 경기 시작부터, 접힘=최근 5개, 더보기=전체.
    historyTitle: string;
    // 더보기 라벨. {count} = 추가로 볼 개수.
    historyMore: string;
    historyLess: string;
    // 지난 신호 항목의 발생 랩 꼬리표. {lap} = 세션 랩.
    historyLap: string;
    // 종류별 한 줄 요약 템플릿. 숫자는 전부 스냅샷에 있는 실측값이며 LLM 을 쓰지 않는다.
    // {code} 드라이버 코드, {laps} 타이어 나이(랩).
    tireAge: string;
    // {gap} 앞차와의 간격(초).
    gapConvergence: string;
    // {rival} 피트인해 위협이 된 뒤차 코드.
    undercutThreat: string;
    // 피트 윈도우(F). {code} 피트해야 할 주체, {rival} 언더컷할 앞차 코드.
    pitWindow: string;
    // {from} → {to} 순위.
    positionSwing: string;
    // 배틀 진입 예측(docs/23). {code} chaser, {rival} 따라잡히는 앞차, {laps} 예측 랩 수.
    // 조사를 피하려 {code} 뒤에는 쉼표를 쓴다(기존 이벤트 번역 관례).
    overtakeForecast: string;
    // 예측 랩이 1일 때. en 은 "1 lap" 단수, ko/ja 는 구조가 같지만 병렬로 둔다.
    overtakeForecastSingular: string;
    // 걸린 챔피언십 포인트 배지. {points} 를 치환한다.
    pointsAtStake: string;
    // 포인트 배지의 스크린리더 라벨. {points} 를 치환한다.
    pointsAtStakeLabel: string;
    // 순위 배지. {position} 을 치환한다.
    position: string;
    // 행 탭 힌트. {code} 를 드라이버 코드로 치환한다.
    openDriver: string;
  };
  // 순위표 바로 위 전용 추월 예측 패널 (docs/24 §개정: 전용 예측 패널).
  // 행의 온전한 스크린리더 문장은 watchNow.overtakeForecast(Singular) 를 재사용한다.
  forecastPanel: {
    // 패널 제목 겸 접근성 라벨.
    title: string;
    // 행의 임박 표기. {laps} 예측 랩 수.
    laps: string;
    // 예측 랩이 1일 때. en 은 "1 lap" 단수, ko/ja 는 구조가 같지만 병렬로 둔다.
    lapsSingular: string;
    // 예측 신뢰도 배지 라벨. 잡는 속도의 랩별 일관성으로 도출된 3단계(docs/23 §신뢰도).
    confidence: Record<OvertakeForecastConfidence, string>;
  };
  // 드라이버 상세 시트의 타이어 전략(사용한 타이어 + 남은 타이어 경우의 수).
  tireStrategy: {
    title: string;
    usedTitle: string;
    remainingTitle: string;
    // 스틴트 데이터가 없을 때(예: 아직 주행 전).
    noData: string;
    // 신품/중고 스틴트 표기.
    new: string;
    used: string;
    // 보유 세트 수. {count} 치환.
    setsCount: string;
    // 가능한 구성 개수. {count} 치환.
    possibilities: string;
    // 계산 한계 안내(규정 기반·레이스 의무 보유·퀄리/프랙티스 미반영).
    note: string;
    // 주말 사용분까지 반영해 좁혔을 때의 안내(A1).
    noteNarrowed: string;
  };
  // 「기록」 상세의 주말 타이어 격자(드라이버 × 세션 사용 compound).
  weekendTires: {
    title: string;
    subtitle: string;
    loading: string;
    empty: string;
    error: string;
    // 격자 첫 열 헤더(드라이버).
    driverColumn: string;
    // 잔여(추정) 열 헤더.
    remainingColumn: string;
    // 잔여 추정 방식 안내(규정 기반 + 세션 사용분 하한, 세트 ID 부재 근사).
    remainingNote: string;
    // 신품/중고 범례·라벨(A3).
    newTire: string;
    usedTire: string;
  };
  // 「기록」 상세의 프랙티스·퀄리 결과 (docs/27, E1).
  weekendResults: {
    title: string;
    subtitle: string;
    loading: string;
    empty: string;
    error: string;
    position: string;
    driver: string;
    best: string;
    gap: string;
    // 세그먼트 랭크 안내(최종 순위와 다름).
    note: string;
  };
  status: Record<SessionStatus, string>;
  // 이벤트 우선순위 배지 라벨. enum 원문(critical/high/…)이 UI 에 노출되지 않도록 번역한다.
  eventPriority: Record<RaceEventPriority, string>;
  freshness: Record<DataFreshnessStatus, string>;
  compound: Record<TireCompound, string>;
  localeName: Record<SupportedLocale, string>;
};

const en: Dictionary = {
  appName: "Racepilot",
  tagline: "Understand the race in real time",
  onboarding: {
    teamTitle: "Pick your team",
    teamSubtitle: "Choose the team you support to personalize your home screen.",
    driverTitle: "Pick your driver",
    driverSubtitle: "Who are you cheering for this season?",
    skip: "Skip for now",
    back: "Back",
    loading: "Loading the grid…",
    unavailable: "Couldn't load the grid right now. You can set this later.",
  },
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
    extraColumns: "Standings with extra timing columns. Scroll horizontally for more.",
    columns: {
      gap: "Gap",
      lastLap: "Last lap",
      topSpeed: "Speed",
      pitStops: "Pit",
      sector: "Sector {n}",
    },
  },
  weather: {
    rain: "Rain",
    dry: "Dry",
  },
  weatherTransition: {
    rainStarting: "Rain is starting",
    trackDrying: "The track is drying",
    subtitle: "Strategy may shift — watch for tire changes",
  },
  commentarySheet: {
    open: "Open commentary detail and ask about it",
    close: "Close",
    title: "Commentary",
    sourceEvent: "What happened",
    standings: "Standings at that moment",
    noContextNote:
      "No point-in-time standings are stored for this note, so answers use the current race data.",
    placeholder: "Ask about this moment…",
    ask: "Ask",
    emptyHint: "Ask about this event — answers stay within this moment.",
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
    openPanel: "Ask AI",
    closePanel: "Close AI panel",
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
    appShort: "Racepilot",
    settings: "Settings",
  },
  tabs: {
    race: "Race",
    archive: "Archive",
    news: "News",
  },
  news: {
    title: "News",
    subtitle: "Results, rules, and team updates around the weekend",
    loading: "Loading news…",
    empty: "Nothing here yet",
    error: "Couldn't load news",
    filter: {
      [NewsFilter.All]: "All",
      [NewsFilter.Result]: "Results",
      [NewsFilter.Rule]: "Rules",
      [NewsFilter.TeamUpdate]: "Teams",
      [NewsFilter.Video]: "Video",
      [NewsFilter.Social]: "Social",
    },
    category: {
      [NewsCategory.Result]: "Result",
      [NewsCategory.Rule]: "Rules",
      [NewsCategory.TeamUpdate]: "Team",
      [NewsCategory.General]: "General",
    },
  },
  archive: {
    title: "Race Archive",
    description: "Completed 2026 races, newest first.",
    loading: "Loading races…",
    listError: "Couldn't load the race archive.",
    detailError: "Couldn't load this race.",
    retry: "Try again",
    empty: "No completed races yet this season.",
    round: "R{round}",
    podium: "Podium",
    results: "Final Classification",
    timeline: "Key Moments",
    openRace: "Open {name} results",
    back: "All races",
    columns: {
      position: "Pos",
      driver: "Driver",
      gap: "Gap",
      laps: "Laps",
      points: "Pts",
    },
    sessionName: {
      race: "Grand Prix",
      sprint: "Sprint",
    },
    status: {
      [ArchiveResultStatus.Finished]: "Finished",
      [ArchiveResultStatus.Dnf]: "DNF",
      [ArchiveResultStatus.Dns]: "DNS",
      [ArchiveResultStatus.Dsq]: "DSQ",
    },
  },
  noSession: {
    connecting: "Connecting…",
    title: "No session running",
    description:
      "There's no live F1 session right now. Look back at the races that already ran.",
    action: "Open race archive",
    askUnavailable:
      "AI answers need race data. Open a past race from the archive tab.",
  },
  settings: {
    title: "Settings",
    close: "Close",
    circuit: "Circuit",
  },
  account: {
    title: "Account",
    signInWithGoogle: "Sign in with Google",
    syncDescription: "Syncs your favorite drivers across devices.",
    signOut: "Sign out",
    signInError: "Sign-in failed. You can keep using the app signed out.",
    anonymousName: "Signed in",
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
    eventHistory: "Event history",
  },
  battles: {
    overtakeLabel: "OT",
    overtakeTitle: "Overtake mode available",
    chasingDescription: "Battling {code} ahead, {gap}s gap",
    aheadDescription: "Battling {code} behind, {gap}s gap",
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
    watchNow: "Also worth watching — {signals}",
  },
  latestEvent: {
    title: "Latest key event",
    openDriver: "Open {code} details",
    previousEvent: "Newer event",
    nextEvent: "Older event",
    position: "Event {current} of {total}",
  },
  watchNow: {
    title: "Watch now",
    subtitle: "What the broadcast is not showing",
    lane: {
      [WatchNowLane.Leader]: "Podium",
      [WatchNowLane.Field]: "Field",
      [WatchNowLane.Favorite]: "My drivers",
    },
    quiet: "Quiet right now",
    signalType: {
      [WatchNowSignalType.TireAge]: "Tires",
      [WatchNowSignalType.GapConvergence]: "Closing",
      [WatchNowSignalType.UndercutThreat]: "Undercut",
      [WatchNowSignalType.PitWindow]: "Pit now",
      [WatchNowSignalType.PositionSwing]: "Swing",
      [WatchNowSignalType.OvertakeForecast]: "Forecast",
    },
    legendToggle: "What these signals mean",
    signalHelp: {
      [WatchNowSignalType.TireAge]: "Tires reaching a worn threshold",
      [WatchNowSignalType.GapConvergence]: "Closing on the car ahead",
      [WatchNowSignalType.UndercutThreat]: "A car behind pitted — undercut risk",
      [WatchNowSignalType.PitWindow]: "Pit now to undercut the car ahead",
      [WatchNowSignalType.PositionSwing]: "A big position change",
      [WatchNowSignalType.OvertakeForecast]: "On track to battle in a few laps",
    },
    historyTitle: "Past signals",
    historyMore: "Show all (+{count})",
    historyLess: "Show less",
    historyLap: "L{lap}",
    tireAge: "{code} on {laps}-lap tires",
    gapConvergence: "{code} {gap}s to car ahead",
    undercutThreat: "{code} — {rival} pitted",
    pitWindow: "{code} — pit to undercut {rival}",
    positionSwing: "{code} P{from} to P{to}",
    overtakeForecast: "{code} expected within 1s of {rival} in {laps} laps",
    overtakeForecastSingular: "{code} expected within 1s of {rival} in 1 lap",
    pointsAtStake: "{points}pt",
    pointsAtStakeLabel: "{points} championship points at stake",
    position: "P{position}",
    openDriver: "Open {code} details",
  },
  forecastPanel: {
    title: "Overtake forecast",
    laps: "{laps} laps",
    lapsSingular: "1 lap",
    confidence: {
      [OvertakeForecastConfidence.High]: "High",
      [OvertakeForecastConfidence.Medium]: "Medium",
      [OvertakeForecastConfidence.Low]: "Low",
    },
  },
  tireStrategy: {
    title: "Tire strategy",
    usedTitle: "Used this session",
    remainingTitle: "Remaining sets",
    noData: "No tire data yet",
    new: "new",
    used: "used",
    setsCount: "{count} sets",
    possibilities: "· {count} possible",
    note: "Estimate from the mandatory returns plus the two reserved race sets (1 hard, 1 medium); returned compounds are the team's choice. Qualifying/practice use isn't included yet.",
    noteNarrowed:
      "Narrowed by this weekend's session use (sets run new after the returns can't have been returned) plus the two reserved race sets. Set counts approximated from new-tyre stints — OpenF1 has no set IDs.",
  },
  weekendTires: {
    title: "Weekend tires",
    subtitle: "Compounds each driver ran, session by session",
    loading: "Loading weekend tires…",
    empty: "No tire data for this weekend",
    error: "Couldn't load weekend tires",
    driverColumn: "Driver",
    remainingColumn: "Remaining (est.)",
    remainingNote:
      "Remaining = regulation sets left, narrowed by sets run new after the mandatory returns plus the two reserved race sets. Set counts approximated from new-tyre stints — OpenF1 has no set IDs.",
    newTire: "new",
    usedTire: "used",
  },
  weekendResults: {
    title: "Practice & Qualifying",
    subtitle: "Best laps and Q1/Q2/Q3 with segment rank",
    loading: "Loading results…",
    empty: "No practice/qualifying results for this weekend",
    error: "Couldn't load results",
    position: "Pos",
    driver: "Driver",
    best: "Best",
    gap: "Gap",
    note: "PN under a Q1/Q2/Q3 time is the rank among drivers who set a time in that segment — different from the final classification.",
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
  appName: "Racepilot",
  tagline: "실시간으로 경기를 이해하세요",
  onboarding: {
    teamTitle: "응원하는 팀을 선택하세요",
    teamSubtitle: "응원하는 팀을 고르면 홈 화면이 맞춤 구성됩니다.",
    driverTitle: "응원하는 선수를 선택하세요",
    driverSubtitle: "올 시즌 누구를 응원하시나요?",
    skip: "나중에 하기",
    back: "뒤로",
    loading: "그리드 불러오는 중…",
    unavailable: "지금은 그리드를 불러올 수 없어요. 나중에 설정할 수 있습니다.",
  },
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
    extraColumns: "추가 기록 열이 있는 순위표입니다. 가로로 스크롤하면 더 볼 수 있습니다.",
    columns: {
      gap: "갭",
      lastLap: "최근 랩",
      topSpeed: "최고속",
      pitStops: "피트",
      sector: "섹터 {n}",
    },
  },
  weather: {
    rain: "강수",
    dry: "건조",
  },
  weatherTransition: {
    rainStarting: "비가 내리기 시작했어요",
    trackDrying: "트랙이 마르고 있어요",
    subtitle: "전략이 급변할 수 있어요 — 타이어 교체 주목",
  },
  commentarySheet: {
    open: "해설 상세 열고 질문하기",
    close: "닫기",
    title: "해설",
    sourceEvent: "무슨 일이었나",
    standings: "그 시점 순위",
    noContextNote:
      "이 해설에는 시점 순위가 저장돼 있지 않아, 답변은 현재 경기 데이터를 기준으로 합니다.",
    placeholder: "이 순간에 대해 물어보세요…",
    ask: "질문",
    emptyHint: "이 이벤트에 대해 물어보세요 — 답변은 이 순간 안에서만 합니다.",
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
    openPanel: "AI 질문 열기",
    closePanel: "AI 패널 닫기",
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
    appShort: "Racepilot",
    settings: "설정",
  },
  tabs: {
    race: "경기",
    archive: "기록",
    news: "뉴스",
  },
  news: {
    title: "뉴스",
    subtitle: "경기 전후의 결과·규정·팀 소식을 한데 모아",
    loading: "뉴스를 불러오는 중…",
    empty: "아직 소식이 없어요",
    error: "뉴스를 불러오지 못했어요",
    filter: {
      [NewsFilter.All]: "전체",
      [NewsFilter.Result]: "결과",
      [NewsFilter.Rule]: "규정",
      [NewsFilter.TeamUpdate]: "팀",
      [NewsFilter.Video]: "영상",
      [NewsFilter.Social]: "소셜",
    },
    category: {
      [NewsCategory.Result]: "결과",
      [NewsCategory.Rule]: "규정",
      [NewsCategory.TeamUpdate]: "팀",
      [NewsCategory.General]: "일반",
    },
  },
  archive: {
    title: "지난 레이스",
    description: "2026 시즌에 끝난 레이스를 최신순으로 봅니다.",
    loading: "레이스를 불러오는 중…",
    listError: "지난 레이스 목록을 불러오지 못했습니다.",
    detailError: "이 레이스를 불러오지 못했습니다.",
    retry: "다시 시도",
    empty: "이번 시즌에 끝난 레이스가 아직 없습니다.",
    round: "R{round}",
    podium: "포디움",
    results: "최종 순위",
    timeline: "주요 장면",
    openRace: "{name} 결과 열기",
    back: "전체 레이스",
    columns: {
      position: "순위",
      driver: "드라이버",
      gap: "갭",
      laps: "랩",
      points: "포인트",
    },
    sessionName: {
      race: "그랑프리",
      sprint: "스프린트",
    },
    status: {
      [ArchiveResultStatus.Finished]: "완주",
      [ArchiveResultStatus.Dnf]: "리타이어",
      [ArchiveResultStatus.Dns]: "미출발",
      [ArchiveResultStatus.Dsq]: "실격",
    },
  },
  noSession: {
    connecting: "연결 중…",
    title: "진행 중인 세션이 없습니다",
    description:
      "지금은 열려 있는 F1 세션이 없습니다. 이미 끝난 레이스를 돌아보세요.",
    action: "지난 레이스 보기",
    askUnavailable:
      "AI가 답하려면 경기 데이터가 필요합니다. 기록 탭에서 지난 레이스를 열어 보세요.",
  },
  settings: {
    title: "설정",
    close: "닫기",
    circuit: "서킷",
  },
  account: {
    title: "계정",
    signInWithGoogle: "Google로 로그인",
    syncDescription: "관심 드라이버를 기기 간에 동기화합니다.",
    signOut: "로그아웃",
    signInError: "로그인에 실패했습니다. 비로그인 상태로 계속 사용할 수 있습니다.",
    anonymousName: "로그인됨",
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
    eventHistory: "이벤트 이력",
  },
  battles: {
    overtakeLabel: "OT",
    overtakeTitle: "오버테이크 모드 사용 가능",
    chasingDescription: "앞차 {code}와 {gap}초 차 접전",
    aheadDescription: "뒤차 {code}와 {gap}초 차 접전",
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
    watchNow: "이것도 볼 만하다 — {signals}",
  },
  latestEvent: {
    title: "최신 주요 이벤트",
    openDriver: "{code} 상세 열기",
    previousEvent: "이전(더 최신) 이벤트",
    nextEvent: "다음(더 이전) 이벤트",
    position: "{total}건 중 {current}번째 이벤트",
  },
  watchNow: {
    title: "지금 볼 것",
    subtitle: "방송이 보여주지 않는 것",
    lane: {
      [WatchNowLane.Leader]: "선두권",
      [WatchNowLane.Field]: "필드",
      [WatchNowLane.Favorite]: "내 드라이버",
    },
    quiet: "지금은 조용함",
    signalType: {
      [WatchNowSignalType.TireAge]: "타이어",
      [WatchNowSignalType.GapConvergence]: "간격",
      [WatchNowSignalType.UndercutThreat]: "언더컷",
      [WatchNowSignalType.PitWindow]: "피트 찬스",
      [WatchNowSignalType.PositionSwing]: "순위",
      [WatchNowSignalType.OvertakeForecast]: "예측",
    },
    legendToggle: "이 신호들이 뭔가요",
    signalHelp: {
      [WatchNowSignalType.TireAge]: "타이어가 임계 랩수에 닳음",
      [WatchNowSignalType.GapConvergence]: "앞차와 간격이 좁혀지는 중",
      [WatchNowSignalType.UndercutThreat]: "뒤차가 피트인 — 언더컷 위협",
      [WatchNowSignalType.PitWindow]: "지금 피트하면 앞차 언더컷 기회",
      [WatchNowSignalType.PositionSwing]: "순위가 크게 변동",
      [WatchNowSignalType.OvertakeForecast]: "몇 랩 후 배틀 진입 예상",
    },
    historyTitle: "지난 신호",
    historyMore: "더보기 (+{count})",
    historyLess: "접기",
    historyLap: "{lap}랩",
    tireAge: "{code} 타이어 {laps}랩째",
    gapConvergence: "{code} 앞차와 {gap}초",
    undercutThreat: "{code} — {rival} 피트인",
    pitWindow: "{code} — 지금 피트하면 {rival} 언더컷",
    positionSwing: "{code} P{from} → P{to}",
    overtakeForecast: "{code}, {laps}랩 후 {rival} 1초 내 진입 예상",
    overtakeForecastSingular: "{code}, 1랩 후 {rival} 1초 내 진입 예상",
    pointsAtStake: "{points}점",
    pointsAtStakeLabel: "챔피언십 {points}점이 걸려 있음",
    position: "P{position}",
    openDriver: "{code} 상세 열기",
  },
  forecastPanel: {
    title: "추월 예측",
    laps: "{laps}랩",
    lapsSingular: "1랩",
    confidence: {
      [OvertakeForecastConfidence.High]: "높음",
      [OvertakeForecastConfidence.Medium]: "보통",
      [OvertakeForecastConfidence.Low]: "낮음",
    },
  },
  tireStrategy: {
    title: "타이어 전략",
    usedTitle: "이번 세션 사용",
    remainingTitle: "남은 세트",
    noData: "아직 타이어 데이터가 없어요",
    new: "신품",
    used: "중고",
    setsCount: "{count}세트 보유",
    possibilities: "· {count}가지",
    note: "반납 규정 + 레이스 의무 보유(하드·미디엄 각 1세트) 기준 추정이에요. 어떤 컴파운드를 반납할지는 팀 선택이라 경우의 수로 표시하며, 퀄리·프랙티스 사용분은 아직 반영하지 않았어요.",
    noteNarrowed:
      "이 주말의 세션 사용분(반납 이후 신품은 반납 불가)과 레이스 의무 보유까지 반영해 좁혔어요. 세트 ID가 없어 신품 스틴트로 세트 수를 근사합니다.",
  },
  weekendTires: {
    title: "주말 타이어",
    subtitle: "세션별로 각 드라이버가 쓴 컴파운드",
    loading: "주말 타이어를 불러오는 중…",
    empty: "이 주말의 타이어 데이터가 없어요",
    error: "주말 타이어를 불러오지 못했어요",
    driverColumn: "드라이버",
    remainingColumn: "잔여(추정)",
    remainingNote:
      "잔여 = 규정상 남은 세트를, 반납 이후 신품으로 깐 세트(반납 불가) + 레이스 의무 보유로 좁힌 추정이에요. 세트 ID가 없어 신품 스틴트로 세트 수를 근사합니다.",
    newTire: "신품",
    usedTire: "중고",
  },
  weekendResults: {
    title: "프랙티스 & 퀄리파잉",
    subtitle: "베스트랩과 Q1/Q2/Q3 세그먼트 랭크",
    loading: "결과를 불러오는 중…",
    empty: "이 주말의 프랙티스/퀄리 결과가 없어요",
    error: "결과를 불러오지 못했어요",
    position: "순위",
    driver: "드라이버",
    best: "베스트",
    gap: "갭",
    note: "Q1/Q2/Q3 기록 아래 P숫자는 그 세그먼트에서 기록한 드라이버끼리의 순위예요 — 최종 순위와 다릅니다.",
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
  appName: "Racepilot",
  tagline: "レースをリアルタイムで理解する",
  onboarding: {
    teamTitle: "応援するチームを選択",
    teamSubtitle: "応援するチームを選ぶとホーム画面が最適化されます。",
    driverTitle: "応援するドライバーを選択",
    driverSubtitle: "今シーズン、誰を応援しますか？",
    skip: "あとで",
    back: "戻る",
    loading: "グリッドを読み込み中…",
    unavailable: "今はグリッドを読み込めません。あとで設定できます。",
  },
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
    extraColumns: "追加データ列付きの順位表です。横にスクロールすると続きが見られます。",
    columns: {
      gap: "差",
      lastLap: "最終LAP",
      topSpeed: "最高速",
      pitStops: "PIT",
      sector: "セクター{n}",
    },
  },
  weather: {
    rain: "降水",
    dry: "ドライ",
  },
  weatherTransition: {
    rainStarting: "雨が降り始めました",
    trackDrying: "路面が乾いてきています",
    subtitle: "戦略が急変する可能性 — タイヤ交換に注目",
  },
  commentarySheet: {
    open: "解説の詳細を開いて質問する",
    close: "閉じる",
    title: "解説",
    sourceEvent: "何が起きたか",
    standings: "その時点の順位",
    noContextNote:
      "この解説には時点の順位が保存されていないため、回答は現在のレースデータに基づきます。",
    placeholder: "この場面について質問…",
    ask: "質問",
    emptyHint: "このイベントについて質問できます — 回答はこの場面の中だけで行います。",
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
    openPanel: "AI に質問",
    closePanel: "AI パネルを閉じる",
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
    appShort: "Racepilot",
    settings: "設定",
  },
  tabs: {
    race: "レース",
    archive: "記録",
    news: "ニュース",
  },
  news: {
    title: "ニュース",
    subtitle: "週末前後の結果・規則・チーム情報をまとめて",
    loading: "ニュースを読み込み中…",
    empty: "まだ情報がありません",
    error: "ニュースを読み込めませんでした",
    filter: {
      [NewsFilter.All]: "すべて",
      [NewsFilter.Result]: "結果",
      [NewsFilter.Rule]: "規則",
      [NewsFilter.TeamUpdate]: "チーム",
      [NewsFilter.Video]: "動画",
      [NewsFilter.Social]: "SNS",
    },
    category: {
      [NewsCategory.Result]: "結果",
      [NewsCategory.Rule]: "規則",
      [NewsCategory.TeamUpdate]: "チーム",
      [NewsCategory.General]: "一般",
    },
  },
  archive: {
    title: "過去のレース",
    description: "2026シーズンの終了済みレースを新しい順に表示します。",
    loading: "レースを読み込み中…",
    listError: "過去のレース一覧を読み込めませんでした。",
    detailError: "このレースを読み込めませんでした。",
    retry: "再試行",
    empty: "今シーズンに終了したレースはまだありません。",
    round: "R{round}",
    podium: "表彰台",
    results: "最終順位",
    timeline: "主な出来事",
    openRace: "{name} の結果を開く",
    back: "レース一覧",
    columns: {
      position: "順位",
      driver: "ドライバー",
      gap: "差",
      laps: "周回",
      points: "ポイント",
    },
    sessionName: {
      race: "グランプリ",
      sprint: "スプリント",
    },
    status: {
      [ArchiveResultStatus.Finished]: "完走",
      [ArchiveResultStatus.Dnf]: "リタイア",
      [ArchiveResultStatus.Dns]: "未出走",
      [ArchiveResultStatus.Dsq]: "失格",
    },
  },
  noSession: {
    connecting: "接続中…",
    title: "進行中のセッションはありません",
    description:
      "現在ライブのF1セッションはありません。すでに終わったレースを振り返りましょう。",
    action: "過去のレースを見る",
    askUnavailable:
      "AIが答えるにはレースデータが必要です。記録タブから過去のレースを開いてください。",
  },
  settings: {
    title: "設定",
    close: "閉じる",
    circuit: "サーキット",
  },
  account: {
    title: "アカウント",
    signInWithGoogle: "Googleでログイン",
    syncDescription: "お気に入りドライバーを端末間で同期します。",
    signOut: "ログアウト",
    signInError: "ログインに失敗しました。未ログインのまま利用できます。",
    anonymousName: "ログイン中",
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
    eventHistory: "イベント履歴",
  },
  battles: {
    overtakeLabel: "OT",
    overtakeTitle: "オーバーテイクモード使用可能",
    chasingDescription: "前方の{code}と{gap}秒差の接戦",
    aheadDescription: "後方の{code}と{gap}秒差の接戦",
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
    watchNow: "こちらも注目 — {signals}",
  },
  latestEvent: {
    title: "最新の重要イベント",
    openDriver: "{code} の詳細を開く",
    previousEvent: "前(より新しい)のイベント",
    nextEvent: "次(より古い)のイベント",
    position: "{total}件中{current}件目のイベント",
  },
  watchNow: {
    title: "いま見るべき",
    subtitle: "中継が映していないもの",
    lane: {
      [WatchNowLane.Leader]: "トップ争い",
      [WatchNowLane.Field]: "フィールド",
      [WatchNowLane.Favorite]: "マイドライバー",
    },
    quiet: "いまは静か",
    signalType: {
      [WatchNowSignalType.TireAge]: "タイヤ",
      [WatchNowSignalType.GapConvergence]: "接近",
      [WatchNowSignalType.UndercutThreat]: "アンダーカット",
      [WatchNowSignalType.PitWindow]: "ピットチャンス",
      [WatchNowSignalType.PositionSwing]: "順位変動",
      [WatchNowSignalType.OvertakeForecast]: "予測",
    },
    legendToggle: "この信号の意味",
    signalHelp: {
      [WatchNowSignalType.TireAge]: "タイヤが摩耗の閾値に到達",
      [WatchNowSignalType.GapConvergence]: "前車との差が縮まっている",
      [WatchNowSignalType.UndercutThreat]: "後車がピットイン — アンダーカットの脅威",
      [WatchNowSignalType.PitWindow]: "今ピットで前車をアンダーカットの好機",
      [WatchNowSignalType.PositionSwing]: "順位が大きく変動",
      [WatchNowSignalType.OvertakeForecast]: "数周後にバトル圏内の見込み",
    },
    historyTitle: "過去の信号",
    historyMore: "すべて表示 (+{count})",
    historyLess: "折りたたむ",
    historyLap: "{lap}周",
    tireAge: "{code} タイヤ{laps}周目",
    gapConvergence: "{code} 前車と{gap}秒",
    undercutThreat: "{code} — {rival} ピットイン",
    pitWindow: "{code} — 今ピットで {rival} をアンダーカット",
    positionSwing: "{code} P{from} → P{to}",
    overtakeForecast: "{code}、{laps}周後に {rival} の1秒以内に接近見込み",
    overtakeForecastSingular: "{code}、1周後に {rival} の1秒以内に接近見込み",
    pointsAtStake: "{points}点",
    pointsAtStakeLabel: "チャンピオンシップ{points}点がかかっている",
    position: "P{position}",
    openDriver: "{code} の詳細を開く",
  },
  forecastPanel: {
    title: "オーバーテイク予測",
    laps: "{laps}周",
    lapsSingular: "1周",
    confidence: {
      [OvertakeForecastConfidence.High]: "高",
      [OvertakeForecastConfidence.Medium]: "中",
      [OvertakeForecastConfidence.Low]: "低",
    },
  },
  tireStrategy: {
    title: "タイヤ戦略",
    usedTitle: "今セッションの使用",
    remainingTitle: "残りセット",
    noData: "タイヤデータがまだありません",
    new: "新品",
    used: "中古",
    setsCount: "{count}セット保有",
    possibilities: "· {count}通り",
    note: "返却ルール + レース義務保有(ハード・ミディアム各1セット)に基づく推定です。どのコンパウンドを返却するかはチーム次第のため場合の数で示し、予選・フリー走行の使用分はまだ反映していません。",
    noteNarrowed:
      "この週末のセッション使用分(返却後の新品は返却不可)とレース義務保有まで反映して絞りました。セットIDがないため新品スティントでセット数を近似します。",
  },
  weekendTires: {
    title: "週末のタイヤ",
    subtitle: "セッションごとに各ドライバーが使ったコンパウンド",
    loading: "週末のタイヤを読み込み中…",
    empty: "この週末のタイヤデータがありません",
    error: "週末のタイヤを読み込めませんでした",
    driverColumn: "ドライバー",
    remainingColumn: "残り(推定)",
    remainingNote:
      "残り = 規定上の残セットを、返却後に新品で使ったセット(返却不可)+ レース義務保有で絞った推定です。セットIDがないため新品スティントでセット数を近似します。",
    newTire: "新品",
    usedTire: "中古",
  },
  weekendResults: {
    title: "フリー走行 & 予選",
    subtitle: "ベストラップと Q1/Q2/Q3 のセグメント順位",
    loading: "結果を読み込み中…",
    empty: "この週末のフリー走行/予選結果がありません",
    error: "結果を読み込めませんでした",
    position: "順位",
    driver: "ドライバー",
    best: "ベスト",
    gap: "差",
    note: "Q1/Q2/Q3 タイムの下の P数字は、そのセグメントでタイムを出したドライバー間の順位です — 最終順位とは異なります。",
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
