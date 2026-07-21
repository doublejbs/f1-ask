// 아카이브 최종 순위 행의 완주 상태.
// OpenF1 session_result 의 dnf / dns / dsq 불리언 셋을 배타적인 하나의 값으로 좁힌다.
export enum ArchiveResultStatus {
  Finished = "finished",
  Dnf = "dnf",
  Dns = "dns",
  Dsq = "dsq",
}
