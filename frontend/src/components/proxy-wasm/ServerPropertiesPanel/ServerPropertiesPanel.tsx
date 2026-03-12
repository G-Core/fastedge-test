import { CollapsiblePanel } from "../../common/CollapsiblePanel";
import { PropertiesEditor } from "../PropertiesEditor";
import { Toggle } from "../../common/Toggle";
import styles from "./ServerPropertiesPanel.module.css";

interface ServerPropertiesPanelProps {
  properties: Record<string, string>;
  onPropertiesChange: (properties: Record<string, string>) => void;
  dotenvEnabled: boolean;
  onDotenvToggle: (enabled: boolean) => void;
}

export function ServerPropertiesPanel({
  properties,
  onPropertiesChange,
  dotenvEnabled,
  onDotenvToggle,
}: ServerPropertiesPanelProps) {
  return (
    <CollapsiblePanel
      title="Server Properties"
      defaultExpanded={false}
      headerExtra={
        <div
          className={styles.toggleContainerRight}
          onClick={(e) => e.stopPropagation()} // Prevent collapse when clicking toggle
        >
          <Toggle
            checked={dotenvEnabled}
            onChange={onDotenvToggle}
            label="Load .env files"
            compact={true}
          />
        </div>
      }
    >
      <PropertiesEditor value={properties} onChange={onPropertiesChange} />
      {dotenvEnabled && (
        <div className={styles.dotenvNotice}>
          <strong>Dotenv enabled:</strong> Secrets from .env.secrets and
          dictionary values from .env.variables are active.
        </div>
      )}
    </CollapsiblePanel>
  );
}
