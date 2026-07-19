import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 워크스페이스 TS 패키지를 Next 가 직접 트랜스파일한다.
  transpilePackages: ["@f1/domain", "@f1/schemas"],
  // 상위 디렉토리의 lockfile 오탐을 방지하고 monorepo 루트를 고정한다.
  outputFileTracingRoot: rootDir,
};

export default nextConfig;
