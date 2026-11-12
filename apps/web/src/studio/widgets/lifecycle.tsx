import { createContext, useContext, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AgTypeScriptComponent } from "ag-studio";
import { WidgetFeedback } from "./widget-feedback";

const RefreshRevision = createContext(0);
export const useRefreshRevision = () => useContext(RefreshRevision);

/** Public Studio lifecycle bridge: every refresh invalidates the widget query. */
export function studioWidget<P extends object>(
  View: ComponentType<P>,
): new () => AgTypeScriptComponent<P> {
  return class implements AgTypeScriptComponent<P> {
    private element = document.createElement("div");
    private root: Root | undefined;
    private revision = 0;
    getGui() {
      return this.element;
    }
    init(params: P) {
      this.element.className = "insight-widget";
      this.root = createRoot(this.element);
      this.refresh(params);
    }
    refresh(params: P) {
      this.root?.render(
        <RefreshRevision.Provider value={++this.revision}>
          <WidgetFeedback>
            <View {...params} />
          </WidgetFeedback>
        </RefreshRevision.Provider>,
      );
    }
    destroy() {
      const root = this.root;
      this.root = undefined;
      // Studio can destroy a widget while its parent React root is committing.
      queueMicrotask(() => root?.unmount());
    }
  };
}
