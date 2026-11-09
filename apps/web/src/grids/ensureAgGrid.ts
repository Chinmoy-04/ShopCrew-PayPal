import { ModuleRegistry } from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
import { AgChartsEnterpriseModule } from "ag-charts-enterprise";

let registered = false;

/** Register AG Grid modules once (lazy-loaded with /control). */
export function ensureAgGrid(licenseKey?: string): void {
  if (registered) return;
  ModuleRegistry.registerModules([AllEnterpriseModule.with(AgChartsEnterpriseModule)]);
  if (licenseKey) LicenseManager.setLicenseKey(licenseKey);
  registered = true;
}
