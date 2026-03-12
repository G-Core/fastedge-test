import { TestConfig } from "../../api";
import styles from "./JsonEditorTab.module.css";

interface JsonEditorTabProps {
  config: TestConfig;
}

export function JsonEditorTab({ config }: JsonEditorTabProps) {
  const jsonText = JSON.stringify(config, null, 2);

  return (
    <div className={styles.container}>
      <textarea
        className={styles.editor}
        value={jsonText}
        readOnly
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
    </div>
  );
}
