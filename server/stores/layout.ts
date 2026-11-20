import { join } from "node:path";

/** `<root>/.fastedge-debug/stores/`: stores.db, service.json, service.lock, service.log. */
export const storesDir = (root: string) => join(root, ".fastedge-debug", "stores");

/** service.json, written by the service once it listens. */
export type Descriptor = { pid: number; port: number; token: string; protocol: number };
