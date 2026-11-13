import type { StoreCall } from "../../../types";
import styles from "./StoreCallsList.module.css";

interface StoreCallsListProps {
  /** undefined: nothing ran yet, or stores are off. */
  calls: StoreCall[] | undefined;
  /** What made the calls, for the empty message ("hook", "request"). */
  source: string;
}

/** The cache / Edge KV calls one hook or request made (the storage trace). */
export function StoreCallsList({ calls, source }: StoreCallsListProps) {
  if (!calls) {
    return <div className={styles.empty}>No storage calls yet (or stores are off).</div>;
  }
  if (calls.length === 0) {
    return <div className={styles.empty}>This {source} made no cache or Edge KV calls.</div>;
  }
  return (
    <pre className={styles.list}>
      {calls.map((call, idx) => {
        const where = call.kind === "cache" ? `cache[${call.dc}]` : `kv[${call.store}]`;
        const arg = call.key ?? call.pattern ?? call.prefix ?? "";
        const failed = call.result !== "ok";
        return (
          <div key={idx} className={failed ? `${styles.entry} ${styles.failed}` : styles.entry}>
            <span className={styles.where}>{where}</span>
            {call.op} {arg}
            {" → "}
            {failed ? call.result : (call.value ?? "ok")}
          </div>
        );
      })}
    </pre>
  );
}
