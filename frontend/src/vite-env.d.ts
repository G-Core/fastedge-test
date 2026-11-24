/// <reference types="vite/client" />
/// <reference types="@testing-library/jest-dom" />

declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

/** package.json version, set at build time (vite.config.ts). */
declare const __APP_VERSION__: string;
