import { useState, useEffect } from "react";
import styles from "./DictionaryInput.module.css";

interface DefaultValue {
  value: string;
  enabled?: boolean; // Whether the default should be checked (default: true)
  placeholder?: string; // Optional placeholder for this specific row
  readOnly?: boolean; // Whether the row should be read-only (default: false)
}

interface DictionaryInputProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  defaultValues?: Record<string, string | DefaultValue>; // Default key-value pairs with optional enabled state
  disableDelete?: boolean; // Disable the delete button for all rows
}

interface Row {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  placeholder?: string; // Per-row placeholder override
  readOnly?: boolean; // Whether the row is read-only
}

// Counter for generating unique row IDs
let rowIdCounter = 0;
const generateRowId = () => `row-${++rowIdCounter}`;

export function DictionaryInput({
  value,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  defaultValues = {},
  disableDelete = false,
}: DictionaryInputProps) {
  const [rows, setRows] = useState<Row[]>(() => {
    // Build maps to track which keys come from defaults and their properties
    const defaultsMap = new Map<string, boolean>();
    const placeholdersMap = new Map<string, string>();
    const readOnlyMap = new Map<string, boolean>();

    // Process defaultValues to normalize them and track enabled state + placeholders + readOnly
    Object.entries(defaultValues).forEach(([key, val]) => {
      if (typeof val === "string") {
        defaultsMap.set(key, true); // String defaults are enabled by default
      } else {
        defaultsMap.set(key, val.enabled ?? true); // Use specified enabled state or default to true
        if (val.placeholder) {
          placeholdersMap.set(key, val.placeholder);
        }
        if (val.readOnly) {
          readOnlyMap.set(key, true);
        }
      }
    });

    // Normalize defaultValues to simple key-value pairs
    const normalizedDefaults: Record<string, string> = {};
    Object.entries(defaultValues).forEach(([key, val]) => {
      normalizedDefaults[key] = typeof val === "string" ? val : val.value;
    });

    // Merge defaultValues with value prop (value prop overrides defaults)
    const mergedValues = { ...normalizedDefaults, ...value };

    // Initialize rows from merged values (only runs once)
    const entries = Object.entries(mergedValues).filter(
      ([k, v]) => k.trim() !== "" || v.trim() !== "",
    );
    if (entries.length === 0) {
      // Start with one empty row
      return [{ id: generateRowId(), key: "", value: "", enabled: true }];
    } else {
      const newRows = entries.map(([key, val]) => ({
        id: generateRowId(),
        key,
        value: val,
        // Use the enabled state from defaultsMap if this key came from defaults,
        // otherwise check if it exists in value prop (if so, it's enabled)
        enabled: defaultsMap.has(key)
          ? defaultsMap.get(key)!
          : value.hasOwnProperty(key),
        // Use the placeholder from placeholdersMap if available
        placeholder: placeholdersMap.get(key),
        // Use the readOnly state from readOnlyMap if available
        readOnly: readOnlyMap.get(key) || false,
      }));
      // Add one empty row at the end (unless delete is disabled)
      if (!disableDelete) {
        newRows.push({
          id: generateRowId(),
          key: "",
          value: "",
          enabled: true,
        });
      }
      return newRows;
    }
  });

  // Sync rows when value prop changes externally (e.g., from calculated properties)
  useEffect(() => {
    setRows((currentRows) => {
      const updatedRows = currentRows.map((row) => {
        // If this key exists in the new value prop, update it
        if (row.key && value.hasOwnProperty(row.key)) {
          return { ...row, value: value[row.key] };
        }
        return row;
      });

      // Add any new keys from value that don't exist in current rows
      const existingKeys = new Set(currentRows.map((r) => r.key));
      const newKeys = Object.keys(value).filter((k) => !existingKeys.has(k));

      if (newKeys.length > 0) {
        const newRows = newKeys.map((key) => ({
          id: generateRowId(),
          key,
          value: value[key],
          enabled: true,
        }));

        // Insert new rows before the last empty row if it exists
        const lastRow = updatedRows[updatedRows.length - 1];
        if (!disableDelete && lastRow && !lastRow.key && !lastRow.value) {
          return [...updatedRows.slice(0, -1), ...newRows, lastRow];
        } else {
          return [...updatedRows, ...newRows];
        }
      }

      return updatedRows;
    });
  }, [value, disableDelete]);

  const updateParent = (updatedRows: Row[]) => {
    const dict: Record<string, string> = {};
    updatedRows.forEach((row) => {
      if (row.enabled && row.key.trim()) {
        dict[row.key.trim()] = row.value.trim();
      }
    });
    onChange(dict);
  };

  const handleKeyChange = (id: string, newKey: string) => {
    const updatedRows = rows.map((row) =>
      row.id === id && !row.readOnly ? { ...row, key: newKey } : row,
    );

    // If this is the last row and now has content, add a new empty row (unless delete is disabled)
    if (!disableDelete) {
      const lastRow = updatedRows[updatedRows.length - 1];
      if (lastRow.id === id && (newKey.trim() || lastRow.value.trim())) {
        updatedRows.push({
          id: generateRowId(),
          key: "",
          value: "",
          enabled: true,
        });
      }
    }

    setRows(updatedRows);
    updateParent(updatedRows);
  };

  const handleValueChange = (id: string, newValue: string) => {
    const updatedRows = rows.map((row) =>
      row.id === id && !row.readOnly ? { ...row, value: newValue } : row,
    );

    // If this is the last row and now has content, add a new empty row (unless delete is disabled)
    if (!disableDelete) {
      const lastRow = updatedRows[updatedRows.length - 1];
      if (lastRow.id === id && (lastRow.key.trim() || newValue.trim())) {
        updatedRows.push({
          id: generateRowId(),
          key: "",
          value: "",
          enabled: true,
        });
      }
    }

    setRows(updatedRows);
    updateParent(updatedRows);
  };

  const handleEnabledChange = (id: string, enabled: boolean) => {
    const updatedRows = rows.map((row) =>
      row.id === id && !row.readOnly ? { ...row, enabled } : row,
    );
    setRows(updatedRows);
    updateParent(updatedRows);
  };

  const handleDelete = (id: string) => {
    const updatedRows = rows.filter((row) => row.id !== id);
    // Ensure at least one empty row remains
    if (updatedRows.length === 0) {
      updatedRows.push({
        id: generateRowId(),
        key: "",
        value: "",
        enabled: true,
      });
    }
    setRows(updatedRows);
    updateParent(updatedRows);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerEnabled}></div>
        <div className={styles.headerKey}>{keyPlaceholder}</div>
        <div className={styles.headerValue}>{valuePlaceholder}</div>
        <div className={styles.headerActions}></div>
      </div>
      {rows.map((row, index) => (
        <div
          key={row.id}
          className={`${styles.row} ${disableDelete || row.readOnly ? styles.noDelete : ""}`}
        >
          <div className={styles.enabled}>
            <input
              type="checkbox"
              checked={row.enabled}
              onChange={(e) => handleEnabledChange(row.id, e.target.checked)}
              disabled={!row.key.trim() || row.readOnly}
            />
          </div>
          <input
            type="text"
            className={styles.key}
            value={row.key}
            onChange={(e) => handleKeyChange(row.id, e.target.value)}
            placeholder={keyPlaceholder}
            readOnly={row.readOnly}
            tabIndex={row.readOnly ? -1 : undefined}
            style={{ opacity: row.readOnly || !row.enabled ? 0.5 : 1 }}
          />
          <input
            type="text"
            className={styles.value}
            value={row.value}
            onChange={(e) => handleValueChange(row.id, e.target.value)}
            placeholder={row.placeholder || valuePlaceholder}
            readOnly={row.readOnly}
            tabIndex={row.readOnly ? -1 : undefined}
            style={{ opacity: row.readOnly || !row.enabled ? 0.5 : 1 }}
          />
          {!disableDelete && !row.readOnly && (
            <button
              className={styles.deleteButton}
              onClick={() => handleDelete(row.id)}
              disabled={
                rows.length === 1 ||
                (rows.length === index + 1 &&
                  !row.key.trim() &&
                  !row.value.trim())
              }
              title="Delete row"
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
