import type { AgWidgetField } from "ag-studio";

/** Resolve the row-object key for a mapped Studio field. */
export function fieldRowKey(field: AgWidgetField): string {
  if ("key" in field && typeof field.key === "string" && field.key) return field.key;
  const ref = field as { id?: string; fieldId?: string };
  return ref.id ?? ref.fieldId ?? "";
}
