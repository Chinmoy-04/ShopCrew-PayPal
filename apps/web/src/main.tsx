import { ModuleRegistry } from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
import { AgChartsEnterpriseModule } from "ag-charts-enterprise";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/app.css";

ModuleRegistry.registerModules([AllEnterpriseModule.with(AgChartsEnterpriseModule)]);

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
if (config.agGridLicenseKey) LicenseManager.setLicenseKey(config.agGridLicenseKey);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App config={config} />
    </ErrorBoundary>
  </StrictMode>,
);
