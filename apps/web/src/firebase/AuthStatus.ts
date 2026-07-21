// 인증 구독 상태 (docs/15-google-auth.md).
// Loading 은 onAuthStateChanged 첫 콜백 이전이다 — 이 동안에도 경기 데이터는 정상 표시된다.
export enum AuthStatus {
  Loading = "Loading",
  SignedOut = "SignedOut",
  SignedIn = "SignedIn",
}
