import { useEffect, useState } from "react";
import type { AgWidgetApi, AgWidgetField, AgWidgetSort } from "ag-studio";
import { fieldRowKey } from "./fieldKey";
import { useRefreshRevision } from "./lifecycle";
import { useWidgetFeedback } from "./widget-feedback";

export function readNumber(row: Record<string, unknown>, key: string): number {
  const direct = key ? row[key] : undefined;
  if (typeof direct === "number") return direct;
  if (direct === null) return 0;
  throw new Error(`Missing numeric field: ${key}`);
}

export function readString(row: Record<string, unknown>, key: string): string {
  const direct = key ? row[key] : undefined;
  if (direct != null && direct !== "") return String(direct);
  if (direct === null || direct === "") return "—";
  throw new Error(`Missing field: ${key}`);
}

export function useWidgetRows<T>(
  widgetApi: AgWidgetApi,
  config: {
    fields: (AgWidgetField | undefined)[];
    sort?: AgWidgetSort[];
    ready: boolean;
    emptyValue?: T;
    select: (rows: Record<string, unknown>[], keys: string[]) => T | null;
  },
  deps: unknown[],
): T | null {
  const [data, setData] = useState<T | null>(null);
  const revision = useRefreshRevision();
  const feedback = useWidgetFeedback();
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    feedback(null);
    if (!config.ready) {
      widgetApi.setDisplayState("incompleteDataMapping");
      setData(null);
      return;
    }

    const fields = config.fields.filter(Boolean) as AgWidgetField[];
    const keys = fields.map(fieldRowKey);

    widgetApi.setDisplayState("loading", { prominent: data === null });
    void widgetApi
      .getData(
        {
          fields,
          sort: config.sort?.map((s) => ({
            field: s.field,
            direction: s.direction,
          })),
        },
        { signal: controller.signal },
      )
      .then((response) => {
        if (cancelled) return;
        const raw = response.results.rows ?? [];
        if (!raw.length) {
          if (config.emptyValue !== undefined) {
            setData(config.emptyValue);
            widgetApi.setDisplayState("displayed");
            return;
          }
          widgetApi.setDisplayState("noData");
          setData(null);
          return;
        }
        const next = config.select(raw, keys);
        if (next == null) {
          widgetApi.setDisplayState("noData");
          setData(null);
          return;
        }
        setData(next);
        widgetApi.setDisplayState("displayed");
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          widgetApi.setDisplayState("displayed");
          feedback({
            message:
              error instanceof Error ? error.message : "Could not load widget",
            retry: () => setRetry((value) => value + 1),
          });
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller supplies mapping deps
  }, [widgetApi, config.ready, revision, retry, ...deps]);

  return data;
}
