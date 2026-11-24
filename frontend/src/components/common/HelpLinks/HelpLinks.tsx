import { openExternal } from "../../../utils/environment";
import styles from "./HelpLinks.module.css";

// Docs of the release that is running, so they describe the features this build has.
const docs = `https://github.com/G-Core/fastedge-test/blob/v${__APP_VERSION__}/docs/`;
const guide = `${docs}DEBUGGER_GUIDE.md`;

const topics: [string, string][] = [
  ["Where the debugger reads your files", `${guide}#where-your-files-go`],
  ["Set environment variables and secrets", `${guide}#dotenv`],
  ["Rotate a secret (slots)", `${docs}TEST_CONFIG.md#dotenv-configuration`],
  ["Add request headers", `${guide}#send-a-request`],
  ["Set the client's country or edge location", `${guide}#request-context`],
  ["Serve a fake origin", `${guide}#request-context`],
  ["Seed and inspect the cache and KV", `${guide}#storage-explorer`],
  ["Run several apps on one CDN resource", `${guide}#multi-app-cdn-resource`],
  ["Save and load a scenario", `${guide}#save-and-load-a-config`],
  ["Load an app from outside your project", `${guide}#folders-outside-the-workspace`],
  ["Test an app in CI", `${docs}TEST_FRAMEWORK.md#runconfig`],
];

const footer: [string, string][] = [
  ["Debugger guide", guide],
  ["All docs", `${docs}INDEX.md`],
  ["VS Code extension", "https://marketplace.visualstudio.com/items?itemName=G-CoreLabsSA.fastedge"],
];

function Link({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        openExternal(url);
      }}
    >
      {label}
    </a>
  );
}

/** "Help ?" in the header: a popover of links into the docs (native popover: Esc and outside click close it). */
export function HelpLinks() {
  return (
    <>
      <button className={styles.button} popoverTarget="help-links">
        <span className={styles.icon} aria-hidden="true">?</span>
        Help
      </button>
      <div id="help-links" popover="auto" className={styles.popover}>
        <ul>
          {topics.map(([label, url]) => (
            <li key={label}>
              <Link label={label} url={url} />
            </li>
          ))}
        </ul>
        <div className={styles.footer}>
          {footer.map(([label, url]) => (
            <Link key={label} label={label} url={url} />
          ))}
          <span>v{__APP_VERSION__}</span>
        </div>
      </div>
    </>
  );
}
