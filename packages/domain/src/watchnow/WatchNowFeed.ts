import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { WatchNowDetector } from "./WatchNowDetector";
import {
  DEFAULT_WATCH_NOW_DETECTOR_CONFIG,
  WatchNowDetectorConfig,
} from "./WatchNowDetectorConfig";
import {
  buildWatchNowLanes,
  selectWatchNowCandidates,
  WatchNowLanes,
} from "./WatchNowLaneBuilder";
import {
  DEFAULT_WATCH_NOW_LANE_CONFIG,
  WatchNowLaneConfig,
} from "./WatchNowLaneConfig";
import { buildOvertakeForecastSignals } from "./WatchNowForecastSignals";
import { WatchNowSignal } from "./WatchNowSignal";

// 버퍼 상한. 정상 동작에서는 후보 창(90초) 밖 신호가 매 프레임 잘려 나가므로 여기까지
// 차지 않는다. 시각이 어긋난 신호(리플레이 · 시계 역행)가 영영 창 밖으로 못 나가는
// 경우에만 걸리는 안전장치이며, 넘치면 오래된 것부터 버린다.
const MAX_BUFFERED_SIGNALS = 500;

export type WatchNowFeedOptions = {
  detectorConfig?: WatchNowDetectorConfig;
  laneConfig?: WatchNowLaneConfig;
};

// 감지 → 후보 축적 → 칸 구성까지를 한 덩어리로 묶은 **클라이언트용 파이프라인**.
//
// **이 클래스가 존재하는 이유는 두 가지다.**
//
//  1. `WatchNowDetector` 는 프레임 간 상태를 들고 있는데(스틴트당 1회 · 연속 3회 유지 ·
//     기준점 갱신), 감지 결과는 한 프레임짜리 사건이라 그대로 화면에 쓰면 매 프레임
//     비워졌다 채워진다. 즉 **감지기 상태 말고 신호 버퍼도 누가 들고 있어야 한다.**
//     그 "누구"를 React 훅에 두면 훅이 상태 기계가 되고 테스트가 불가능해진다
//     (vitest 는 `packages/**/test` 만 수집한다).
//  2. **같은 스냅샷을 두 번 관측하면 중복 발화한다.** 연속 3회 유지 · 순위 기준점 갱신이
//     모두 관측 횟수에 묶여 있기 때문이다. React 는 StrictMode 이중 렌더 · useMemo 캐시
//     폐기 등으로 같은 입력을 여러 번 흘려보낼 수 있으므로, **중복 방지를 호출자에게
//     맡기지 않고 여기서 프레임 식별자로 잠근다.** 덕분에 훅 쪽은 observe 를 몇 번
//     부르든 안전하다.
//
// 한 세션에 인스턴스 하나를 두고 스냅샷이 갱신될 때마다 observe 를 호출한다.
export class WatchNowFeed {
  private readonly detectorConfig: WatchNowDetectorConfig;
  private readonly laneConfig: WatchNowLaneConfig;
  private detector: WatchNowDetector;
  private signals: WatchNowSignal[] = [];
  // 마지막으로 관측한 프레임 식별자. 같은 프레임이 다시 들어오면 통째로 건너뛴다.
  private lastFrameKey: string | null = null;
  private lastSessionId: string | null = null;

  constructor({
    detectorConfig = DEFAULT_WATCH_NOW_DETECTOR_CONFIG,
    laneConfig = DEFAULT_WATCH_NOW_LANE_CONFIG,
  }: WatchNowFeedOptions = {}) {
    this.detectorConfig = detectorConfig;
    this.laneConfig = laneConfig;
    this.detector = new WatchNowDetector(detectorConfig);
  }

  // 스냅샷 하나를 관측한다. 실제로 새 프레임을 소비했으면 true.
  //
  // 프레임 식별자는 `sessionId + version` 이다. `UseLiveRace` 가 이미 version 변경을
  // 프레임 경계로 쓰고 있으므로 같은 기준을 그대로 따른다.
  observe(snapshot: LiveRaceSnapshot): boolean {
    // 세션이 바뀌면 이전 세션의 드라이버별 상태(타이어 나이 · 순위 기준점 · 피트 횟수)가
    // 전부 무의미하다. 그대로 두면 첫 프레임에 순위 급변이 무더기로 터진다.
    if (this.lastSessionId !== null && this.lastSessionId !== snapshot.sessionId) {
      this.reset();
    }

    const frameKey = `${snapshot.sessionId}:${snapshot.version}`;

    if (frameKey === this.lastFrameKey) {
      return false;
    }

    this.lastFrameKey = frameKey;
    this.lastSessionId = snapshot.sessionId;

    this.signals.push(...this.detector.observe(snapshot));

    // 예측은 감지가 아니라 변환이다 — 워커가 스냅샷에 실은 overtakeForecasts 를 신호로 옮겨
    // 감지 신호와 같은 버퍼에 넣는다. 프레임 식별자 중복 방지가 이미 걸려 있어 같은 프레임을
    // 두 번 관측해도 예측 신호가 두 번 쌓이지 않는다(docs/23 §UI).
    this.signals.push(...buildOvertakeForecastSignals(snapshot));

    this.pruneSignals(this.resolveReferenceMs(snapshot));

    return true;
  }

  // 지금 화면에 올릴 칸 3개를 만든다. 부수효과가 없으므로 몇 번을 불러도 결과가 같다.
  buildLanes(
    snapshot: LiveRaceSnapshot,
    favoriteDriverNumbers: readonly number[] = [],
  ): WatchNowLanes {
    const referenceMs = this.resolveReferenceMs(snapshot);

    return buildWatchNowLanes({
      signals: selectWatchNowCandidates(
        this.signals,
        referenceMs,
        this.laneConfig,
      ),
      snapshot,
      favoriteDriverNumbers: [...favoriteDriverNumbers],
      config: this.laneConfig,
    });
  }

  // 감지기 상태와 신호 버퍼를 모두 버린다.
  reset(): void {
    this.detector = new WatchNowDetector(this.detectorConfig);
    this.signals = [];
    this.lastFrameKey = null;
    this.lastSessionId = null;
  }

  // 시간 기준은 벽시계가 아니라 **스냅샷의 generatedAt** 이다. 신호의 detectedAt 이
  // 같은 값에서 나오므로 둘을 같은 축에서 비교해야 후보 창이 맞는다. 리플레이처럼
  // 과거 시각을 재생하는 소스에서 벽시계를 쓰면 모든 신호가 창 밖으로 밀려 화면이
  // 영영 비어 있게 된다.
  private resolveReferenceMs(snapshot: LiveRaceSnapshot): number {
    const generatedMs = Date.parse(snapshot.generatedAt);

    if (Number.isNaN(generatedMs)) {
      return Date.now();
    }

    return generatedMs;
  }

  private pruneSignals(referenceMs: number): void {
    const windowStartMs = referenceMs - this.laneConfig.candidateWindowMs;

    this.signals = this.signals.filter((signal) => {
      const detectedMs = Date.parse(signal.detectedAt);

      // 파싱 불가한 신호는 후보 선별에서 어차피 탈락하므로 버퍼에 남길 이유가 없다.
      if (Number.isNaN(detectedMs)) {
        return false;
      }

      return detectedMs > windowStartMs;
    });

    if (this.signals.length > MAX_BUFFERED_SIGNALS) {
      this.signals = this.signals.slice(-MAX_BUFFERED_SIGNALS);
    }
  }
}
