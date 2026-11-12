import type { AgTypeScriptComponent, AgWidgetParams } from "ag-studio";
import type { ExplorerControlsData } from "../registry";

/** Studio owns the position; the application portals its controlled filters here. */
export class ExplorerControls implements AgTypeScriptComponent<
  AgWidgetParams<ExplorerControlsData>
> {
  private element = document.createElement("div");
  private params?: AgWidgetParams<ExplorerControlsData>;
  private active = false;
  getGui() {
    return this.element;
  }
  init(params: AgWidgetParams<ExplorerControlsData>) {
    this.params = params;
    this.active = true;
    this.element.className = "insight-controls-slot";
    params.widgetApi.setDisplayState("displayed");
    queueMicrotask(() => {
      if (this.active)
        params.context?.mountControls?.(params.widgetId, this.element);
    });
  }
  refresh(params: AgWidgetParams<ExplorerControlsData>) {
    params.widgetApi.setDisplayState("displayed");
  }
  destroy() {
    this.active = false;
    const params = this.params;
    queueMicrotask(() =>
      params?.context?.unmountControls?.(params.widgetId, this.element),
    );
  }
}
