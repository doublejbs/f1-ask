"use client";

import { AuthStatus } from "@/firebase/AuthStatus";
import { type FirebaseAuthController } from "@/hooks/UseFirebaseAuth";
import { Dictionary } from "@/i18n/Messages";
import { LogIn, LogOut, User } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  auth: FirebaseAuthController;
};

// 계정 섹션 (docs/15-google-auth.md §UI).
// 설정 시트 안에서만 로그인 상태를 노출한다 — 상태바는 경기 정보에 집중한다.
// 주의: 로그인 버튼에는 press 를 붙이지 않는다. 리다이렉트 폴백으로 페이지가 떠날 때
// :active 오버레이가 굳는 문제가 있었다(653ca53).
const ACTION_CLASS =
  "glass-chip flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-foreground transition-colors hover:bg-white/10";

export const AccountSectionView = ({ dictionary, auth }: Props) => {
  // Firebase 설정이 없으면 계정 기능 자체가 없다 — 빈 껍데기를 보여주지 않는다.
  if (!auth.isAvailable) {
    return null;
  }

  const handleSignIn = () => {
    void auth.signIn();
  };

  const handleSignOut = () => {
    void auth.signOut();
  };

  // 인증 상태 확인 중에는 자리만 잡아 두어 버튼이 깜빡이며 바뀌지 않게 한다.
  if (auth.status === AuthStatus.Loading) {
    return (
      <div className="hairline flex min-h-[3rem] items-center py-3">
        <span className="text-[13px] text-muted-foreground">
          {dictionary.account.title}
        </span>
      </div>
    );
  }

  if (auth.status === AuthStatus.SignedIn && auth.user !== null) {
    const { displayName, email, photoUrl } = auth.user;

    return (
      <div className="hairline flex flex-col gap-3 py-3">
        <div className="flex items-center gap-3">
          {photoUrl === null ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-muted-foreground">
              <User className="h-4 w-4" />
            </span>
          ) : (
            // 구글 프로필 이미지. 원격 도메인 설정이 필요 없도록 next/image 대신 img 를 쓴다.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {displayName ?? dictionary.account.anonymousName}
            </p>
            {email === null ? null : (
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            )}
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className={ACTION_CLASS}
          >
            <LogOut className="h-4 w-4" />
            {dictionary.account.signOut}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="hairline flex flex-col gap-2 py-3">
      <button
        type="button"
        onClick={handleSignIn}
        disabled={auth.isSigningIn}
        className={`${ACTION_CLASS} w-full disabled:opacity-40`}
      >
        <LogIn className="h-4 w-4" />
        {dictionary.account.signInWithGoogle}
      </button>

      <p className="text-xs text-muted-foreground">
        {dictionary.account.syncDescription}
      </p>

      {auth.hasSignInError ? (
        <p role="alert" className="text-xs font-semibold text-destructive">
          {dictionary.account.signInError}
        </p>
      ) : null}
    </div>
  );
};
