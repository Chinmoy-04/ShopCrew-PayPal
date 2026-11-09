import { useEffect, useState } from "react";
import type { AgWidgetApi, AgWidgetField, AgWidgetSort } from "ag-studio";
import { fieldRowKey } from "./fieldKey";

export function readNumber(row: Record<string, unknown>, key: string): number {
  const direct = key ? row[key] : undefined;
  if (typeof direct === "number") return direct;
  const first = Object.values(row).find((v) => typeof v === "number");
  return typeof first === "number" ? first : 0;
}

export function readString(row: Record<string, unknown>, key: string): string {
  const direct = key ? row[key] : undefined;
  if (direct != null && direct !== "") return String(direct);
  const first = Object.values(row).find((v) => v != null && v !== "");
  return first != null ? String(first) : "—";
}

export function useWidgetRows<T>(
  widgetApi: AgWidgetApi,
  config: {
    fields: (AgWidgetField | undefined)[];
    sort?: AgWidgetSort[];
    ready: boolean;
    select: (rows: Record<string, unknown>[], keys: string[]) => T | null;
  },
  deps: unknown[],
): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!config.ready) {
      widgetApi.setDisplayState("incompleteDataMapping");
      setData(null);
      return;
    }

    const fields = config.fields.filter(Boolean) as AgWidgetField[];
    const keys = fields.map(fieldRowKey);

    widgetApi.setDisplayState("loading");
    void widgetApi
      .getData({
        fields,
        sort: config.sort?.map((s) => ({ field: s.field, direction: s.direction })),
      })
      .then((response) => {
        if (cancelled) return;
        const raw = response.results.rows ?? [];
        if (!raw.length) {
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
      .catch(() => {
        if (!cancelled) {
          widgetApi.setDisplayState("noData");
          setData(null);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller supplies mapping deps
  }, [widgetApi, config.ready, ...deps]);

  return data;
}
