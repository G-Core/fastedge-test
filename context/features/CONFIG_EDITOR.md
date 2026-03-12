# Config Editor Feature

## Overview

Modal-based configuration editor that allows users to save and load test configurations to/from JSON files. Supports multiple save strategies depending on the browser environment.

---

## Components

### ConfigEditorModal
**Location:** `frontend/src/components/ConfigEditorModal/`

Modal with two tabs:
- **JSON Editor** (Implemented) - Real-time JSON editing with validation
- **Form Editor** (Coming Soon) - Visual form with existing UI components

**Key Features:**
- Real-time JSON validation with error highlighting
- Format button for pretty-printing
- Smart save strategy (tries multiple methods)
- ESC key to close
- Backdrop click to close

---

## Save Flow (4-Tier Strategy)

### Strategy 0: VSCode Webview (iframe context)
**When:** Running inside the VSCode debugger panel (`window !== window.top`)
**Result:** Native VSCode "Save As" dialog opening at the app root

The iframe cannot use browser file APIs (sandboxed cross-origin restriction). Instead it delegates to the extension host via `postMessage`:

```typescript
// ConfigEditorModal.tsx
if (window !== window.top) {
  const filePath = await new Promise<string | null>((resolve) => {
    window.addEventListener('message', (e) => {
      if (e.data?.command === 'savePickerResult')
        resolve(e.data.canceled ? null : e.data.filePath);
    });
    window.parent.postMessage({ command: 'openSavePicker', suggestedName }, '*');
  });
  if (filePath) {
    await saveConfigAs(editedConfig, filePath); // POST /api/config/save-as
  }
}
```

The outer webview HTML bridges the message to the extension host, which calls:
```typescript
vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(path.join(appRoot, suggestedName)) })
```

**Pros:**
- ✅ Native VSCode dialog, opens at app root
- ✅ Returns absolute path → server writes file directly

---

### Strategy 1: File System Access API (Chrome/Edge)
**When:** Modern browsers (Chrome 86+, Edge 86+) in standalone mode
**Result:** Native OS "Save As" dialog with full folder navigation

```typescript
await window.showSaveFilePicker({
  suggestedName: 'fastedge-config.test.json',
  types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
});
```

**Pros:**
- ✅ Native OS dialog (familiar UX)
- ✅ Browse folders freely

**Cons:**
- ❌ Only Chrome/Edge/Opera support
- ❌ Not available in Firefox/Safari
- ❌ Not available in VS Code webviews (Strategy 0 handles that case first)

---

### Strategy 2: Backend Electron Dialog
**When:** Running inside an Electron shell with dialog API available
**Endpoint:** `POST /api/config/show-save-dialog`

Returns 501 in standard Node.js — only activates if the server is running inside Electron. Falls through otherwise.

---

### Strategy 3: Prompt Fallback (Firefox/Safari)
**When:** No other strategy succeeded
**Result:** Text prompt asking for file path

User enters path (relative or absolute). Backend ensures `.json` extension and creates directories if needed.

**Cons:** ❌ No folder browsing, easy to make path mistakes

---

## Load Flow

### VSCode Webview (iframe context)
`<input type="file">` technically works in a sandboxed iframe but always opens at `~`. Instead:

```typescript
if (window !== window.top) {
  window.addEventListener('message', handleFilePickerResult);
  window.parent.postMessage({ command: 'openFilePicker' }, '*');
}
```

Extension host handles `openFilePicker`:
```typescript
vscode.window.showOpenDialog({ defaultUri: vscode.Uri.file(appRoot), filters: { 'JSON Files': ['json'] } })
// reads file, posts { command: 'filePickerResult', content, fileName } back
```

### Standalone Browser
Uses native `<input type="file">` picker — works in all browsers, opens at OS default location.

---

## Browser Compatibility

| Browser | Save Method | Dialog Type |
|---------|-------------|-------------|
| **VS Code webview** | Strategy 0: postMessage bridge | ✅ Native VSCode dialog at app root |
| **Chrome 86+** | Strategy 1: File System Access API | ✅ Native OS dialog |
| **Edge 86+** | Strategy 1: File System Access API | ✅ Native OS dialog |
| **Opera 72+** | Strategy 1: File System Access API | ✅ Native OS dialog |
| **Firefox** | Strategy 3: Prompt fallback | ❌ Text prompt only |
| **Safari** | Strategy 3: Prompt fallback | ❌ Text prompt only |

---

## API Endpoints

### `POST /api/config/show-save-dialog`
Shows save dialog (Electron only, for VS Code integration).

**Request:**
```json
{
  "suggestedName": "my-config.json"
}
```

**Response (success):**
```json
{
  "ok": true,
  "filePath": "/home/user/my-config.json"
}
```

**Response (cancelled):**
```json
{
  "ok": true,
  "canceled": true
}
```

**Response (not available):**
```json
{
  "ok": false,
  "fallbackRequired": true,
  "error": "Dialog API not available"
}
```

---

### `POST /api/config/save-as`
Saves config to specified file path.

**Request:**
```json
{
  "config": { ... },
  "filePath": "configs/my-test.json"
}
```

**Response:**
```json
{
  "ok": true,
  "savedPath": "/full/path/to/configs/my-test.json"
}
```

**Features:**
- Creates directories if needed
- Ensures `.json` extension
- Supports relative and absolute paths
- Relative paths resolve from project root

---

## File Naming

The suggested filename is always `fastedge-config.test.json`:

```typescript
const suggestedName = "fastedge-config.test.json";
```

This is intentional — `fastedge-config.test.json` is the marker used by `resolveAppRoot()` in the VSCode extension to identify the app root directory. Keeping the suggested name consistent means the saved file immediately acts as the root marker for that project. Users can rename it in the save dialog if needed (e.g. to save multiple scenario configs alongside the primary one).

---

## JSON Validation

Real-time validation checks:
- ✅ Valid JSON syntax
- ✅ Required fields: `request`, `properties`, `logLevel`
- ✅ Required nested fields: `request.method`, `request.url`, `request.headers`, `request.body`
- ✅ Type checking: `logLevel` must be number
- ✅ Optional fields: `description`, `wasm` (with required `wasm.path`)

**Validation Errors:**
- Show inline with error message
- Prevent saving while invalid
- Update in real-time as user types

---

## Known Limitations

### 1. No Native Dialog in Firefox/Safari
**Issue:** File System Access API not supported
**Impact:** Users must type file path in prompt
**Workaround:** Use Chrome/Edge for testing, or accept prompt UX
**Future:** Could build custom file browser UI

### 2. Form Editor Tab Not Implemented
**Issue:** Only JSON editor tab is functional
**Impact:** Users must edit raw JSON (no visual form)
**Future:** Will reuse existing components (PropertiesEditor, RequestPanel, etc.)

---

## Testing Recommendations

### Local Development (Node + Browser)
- ✅ **Chrome/Edge**: Full native dialog experience
- ⚠️ **Firefox**: Prompt fallback only

### VS Code Extension Development
- Native load/save dialogs are fully implemented via postMessage bridge
- Extension handles `openFilePicker` (load) and `openSavePicker` (save) in `DebuggerWebviewProvider.ts`
- Both dialogs open at the app root (`serverManager.getAppRoot()`)

---

## Future Enhancements

### Form Editor Tab
Reuse existing components in controlled mode:
```tsx
<FormEditorTab config={config} onChange={setConfig}>
  <PropertiesEditorControlled
    value={config.properties}
    onChange={(p) => setConfig({...config, properties: p})}
  />
  <RequestPanelControlled ... />
  <LogLevelSelectorControlled ... />
</FormEditorTab>
```

**Benefits:**
- Familiar UI (same as main app)
- Visual editing (no JSON knowledge needed)
- Sync with JSON tab

**Requirements:**
- Extract logic into hooks (`usePropertiesLogic`, etc.)
- Create controlled versions of components
- Implement bi-directional sync between tabs

---

### Custom File Browser (Universal Solution)
Build HTML/CSS/JS file tree component:
- Backend API: `GET /api/filesystem/list?path=...`
- Frontend: Tree navigation + filename input
- Works in all browsers
- Consistent UX

**Pros:** Universal, no browser dependencies
**Cons:** 1-2 hours work, security considerations for directory listing

---

## Debug Logging

Console logs help diagnose save issues:

```
[ConfigEditor] File System Access API available: true/false
[ConfigEditor] Browser: Mozilla/5.0 ...
[ConfigEditor] Attempting to show save dialog...
[ConfigEditor] Dialog closed, handle: ...
```

**Can be removed for production** or gated behind debug flag.

---

## Files Modified

**Created:**
- `frontend/src/components/ConfigEditorModal/ConfigEditorModal.tsx`
- `frontend/src/components/ConfigEditorModal/ConfigEditorModal.module.css`
- `frontend/src/components/ConfigEditorModal/JsonEditorTab.tsx`
- `frontend/src/components/ConfigEditorModal/JsonEditorTab.module.css`
- `frontend/src/components/ConfigEditorModal/index.tsx`

**Modified:**
- `frontend/src/App.tsx` - Modal integration, load/save handlers
- `frontend/src/api/index.ts` - Added `showSaveDialog()`, `saveConfigAs()`
- `server/server.ts` - Added dialog and save-as endpoints

---

## Integration with Existing Features

### Config State Management
Uses existing Zustand store methods:
- `exportConfig()` - Gets current state as TestConfig
- `loadFromConfig(config)` - Loads config into store

### WebSocket Integration
When config saved via backend, properties update events are emitted:
```typescript
if (config.properties) {
  stateManager.emitPropertiesUpdated(config.properties, source);
}
```

### Environment Detection
Respects existing environment logic:
- `getEnvironment()` API returns `'vscode' | 'node'`
- Determines default behavior and available features

---

**Last Updated:** March 2026
