import { CollapsiblePanel } from "../../common/CollapsiblePanel";
import { PropertiesEditor } from "../PropertiesEditor";

interface ServerPropertiesPanelProps {
  properties: Record<string, string>;
  calculatedProperties: Record<string, string>;
  onPropertiesChange: (properties: Record<string, string>) => void;
}

export function ServerPropertiesPanel({
  properties,
  calculatedProperties,
  onPropertiesChange,
}: ServerPropertiesPanelProps) {
  return (
    <CollapsiblePanel title="Server Properties" defaultExpanded={false}>
      <PropertiesEditor
        value={properties}
        calculatedProperties={calculatedProperties}
        onChange={onPropertiesChange}
      />
    </CollapsiblePanel>
  );
}
