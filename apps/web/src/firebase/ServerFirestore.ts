import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// Firebase Admin SDK 초기화 — 서버 전용 (docs/26 §서버측 Firestore).
//
// **클라이언트 번들 노출 금지**: 이 모듈은 서버 라우트(/api/ask)에서만 import 한다. Admin SDK 는
// 서비스 계정 권한을 갖으므로 브라우저 번들(Client.ts)과 절대 섞이지 않는다. 자격은 공개
// NEXT_PUBLIC_ 이 아니라 서버 전용 FIREBASE_SERVICE_ACCOUNT(JSON) 로만 읽는다.
//
// 워커(functions)는 런타임 ADC(initializeApp() 인자 없음)를 쓰지만, Vercel 서버에는 ADC 가
// 없다 — 서비스 계정 JSON 을 환경변수로 주입해 cert() 로 초기화한다. **읽기 전용**으로만 쓴다.

// 서비스 계정 JSON 을 담는 서버 환경변수 이름. NEXT_PUBLIC_ 접두사가 아니라 서버에만 존재한다.
const SERVICE_ACCOUNT_ENV = "FIREBASE_SERVICE_ACCOUNT";

// Admin 앱을 이름으로 명시해 중복 초기화·핫리로드에서 식별 가능하게 한다 (firebase-admin과
// firebase 클라이언트 SDK는 앱 레지스트리가 분리돼 충돌하지 않음).
const ADMIN_APP_NAME = "f1-ask-server";

// 서비스 계정 자격이 설정돼 있는지. 팩토리 조립부(AiProvider)가 이 값으로 툴 활성 여부를 가른다.
export const hasServerFirestoreCredentials = (): boolean => {
  const raw = process.env[SERVICE_ACCOUNT_ENV];

  return raw !== undefined && raw.trim().length > 0;
};

type ServiceAccountCredential = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

// 환경변수의 JSON 을 파싱해 firebase-admin cert() 가 요구하는 형태로 정규화한다.
// privateKey 는 환경변수에 `\n` 리터럴로 담기는 일이 흔해 실제 개행으로 되돌린다.
// 파싱 오류 메시지는 원본을 서버 로그에만 남기고 고정 문구로 throw 한다 (민감 정보 유출 방지).
const parseServiceAccount = (raw: string): ServiceAccountCredential => {
  let parsed: {
    project_id?: unknown;
    client_email?: unknown;
    private_key?: unknown;
  };

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "unknown error";
    console.warn(
      `${SERVICE_ACCOUNT_ENV} JSON parse error:`,
      errorMessage,
    );
    throw new Error(
      `${SERVICE_ACCOUNT_ENV} is not valid JSON`,
    );
  }

  const projectId = parsed.project_id;
  const clientEmail = parsed.client_email;
  const privateKey = parsed.private_key;

  if (
    typeof projectId !== "string" ||
    typeof clientEmail !== "string" ||
    typeof privateKey !== "string"
  ) {
    throw new Error(
      `${SERVICE_ACCOUNT_ENV} 에 project_id·client_email·private_key 가 모두 있어야 한다`,
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
};

// 서버리스 콜드 스타트마다 중복 초기화되지 않도록 이름 붙은 앱을 한 번만 만든다.
const getServerFirebaseApp = (): App => {
  const existing = getApps().find((app) => app.name === ADMIN_APP_NAME);

  if (existing !== undefined) {
    return getApp(ADMIN_APP_NAME);
  }

  const raw = process.env[SERVICE_ACCOUNT_ENV];

  if (raw === undefined || raw.trim().length === 0) {
    // 자격이 없으면 명확히 실패한다 — 조립부는 hasServerFirestoreCredentials 로 이미 걸러
    // 툴을 비활성화하므로, 여기까지 왔다면 설정 오류다.
    throw new Error(`${SERVICE_ACCOUNT_ENV} 환경변수가 설정되지 않았다`);
  }

  const credential = parseServiceAccount(raw);

  return initializeApp(
    {
      credential: cert({
        projectId: credential.projectId,
        clientEmail: credential.clientEmail,
        privateKey: credential.privateKey,
      }),
    },
    ADMIN_APP_NAME,
  );
};

// 서버 전용 Firestore 핸들(읽기 전용 용도). 모듈 캐시로 앱 인스턴스를 재사용한다.
export const getServerFirestore = (): Firestore => {
  return getFirestore(getServerFirebaseApp());
};
