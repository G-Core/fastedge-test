/// <reference types="vite/client" />
/// <reference types="@testing-library/jest-dom" />

declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

/** The git ref the Help links open: the release's tag, or main for an unreleased build (vite.config.ts). */
declare const __DOCS_REF__: string;
