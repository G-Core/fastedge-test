import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  // StrictMode disabled to prevent WebSocket double-connection in dev
  // Re-enable for production builds
  <App />,
);
