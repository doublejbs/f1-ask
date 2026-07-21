// Cloud Functions 번들러 (docs/16-poller-worker.md §배포 제약).
//
// 두 가지 제약이 겹쳐서 번들링이 필수다.
//   1. @f1/domain 의 main 이 ./src/Domain.ts — TypeScript 소스를 그대로 내보낸다.
//      Functions 런타임은 TS 를 실행하지 못한다.
//   2. Firebase 배포는 npm 으로 설치하는데 workspace:* 프로토콜을 이해하지 못한다.
//
// esbuild 로 단일 JS 파일을 만들면 도메인 소스가 인라인되어 둘 다 사라진다.
// firebase-admin / firebase-functions 는 런타임이 제공하므로 external 로 둔다.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const OUT_FILE = fileURLToPath(new URL("./lib/Bundle.js", import.meta.url));

// 런타임이 제공하는 패키지. functions/package.json 의 dependencies 와 일치해야 한다.
const EXTERNAL = ["firebase-admin", "firebase-functions"];

// functions/package.json 에 workspace:* 를 한 줄도 두지 않기 위해 의존이 아니라
// 소스 경로로 해석한다. functions/tsconfig.json 의 paths 와 같은 경로여야 한다.
const DOMAIN_ENTRY = fileURLToPath(
  new URL("../packages/domain/src/Domain.ts", import.meta.url),
);

const result = await build({
  entryPoints: [fileURLToPath(new URL("./src/PollerFunction.ts", import.meta.url))],
  alias: { "@f1/domain": DOMAIN_ENTRY },
  outfile: OUT_FILE,
  bundle: true,
  platform: "node",
  target: "node20",
  // Functions 는 package.json 의 main 을 CommonJS 로 로드한다.
  format: "cjs",
  external: EXTERNAL,
  sourcemap: false,
  minify: false,
  logLevel: "info",
  metafile: true,
});

const bundledExternals = Object.keys(result.metafile.inputs).filter((input) =>
  EXTERNAL.some((name) => input.includes(`node_modules/${name}/`)),
);

if (bundledExternals.length > 0) {
  throw new Error(
    `external 로 지정한 패키지가 번들에 들어갔다: ${bundledExternals.join(", ")}`,
  );
}

const sizeKb = (statSync(OUT_FILE).size / 1024).toFixed(1);

// eslint-disable-next-line no-console
console.log(`번들 생성 완료: lib/Bundle.js (${sizeKb} KB, external: ${EXTERNAL.join(", ")})`);
