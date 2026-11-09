import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/app.css";

async function loadConfig(attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch("/api/config");
      if (response.ok) return response.json();
    } catch {
      /* server still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return {};
}

const config = await loadConfig();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App config={config} />
    </ErrorBoundary>
  </StrictMode>,
);
