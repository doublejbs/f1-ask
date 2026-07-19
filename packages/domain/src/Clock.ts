// 가상 시계 추상화 (docs/02-architecture.md §46.2)
// Live Mode 는 system clock, Replay/Mock 은 virtual clock 을 사용한다.
// 이벤트 cooldown/grouping 로직을 테스트 가능하게 만든다.
export interface Clock {
  now(): Date;
  sleep(milliseconds: number): Promise<void>;
}

// 실제 시스템 시계
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}

// 결정론적 테스트/Replay 용 가상 시계
export class VirtualClock implements Clock {
  private currentMs: number;

  constructor(startEpochMs: number) {
    this.currentMs = startEpochMs;
  }

  now(): Date {
    return new Date(this.currentMs);
  }

  advance(milliseconds: number): void {
    this.currentMs += milliseconds;
  }

  sleep(milliseconds: number): Promise<void> {
    this.advance(milliseconds);

    return Promise.resolve();
  }
}
