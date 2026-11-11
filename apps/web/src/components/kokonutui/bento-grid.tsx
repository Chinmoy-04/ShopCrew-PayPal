"use client";

/**
 * @author: @dorianbaffier
 * @description: Widget Grid
 * @version: 3.0.0
 * @date: 2026-10-14
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

// Adapted from Kokonut UI's MIT Widget Grid: static marketing variant.
// Retains item/span/render composition; removes drag, resize and demo data.
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/utils";

export type WidgetSize = "s" | "m" | "l";
export interface WidgetGridItem {
  id: string;
  title: string;
  icon?: ReactNode;
  render: (size: WidgetSize) => ReactNode;
  defaultSpan?: number;
}
export default function WidgetGrid({ items, className }: { items: WidgetGridItem[]; className?: string }) {
  const reduced = useReducedMotion();
  return <div className={cn("agent-grid", className)}>
    {items.map((item) => <motion.article key={item.id}
      className={cn("agent-cell", item.defaultSpan === 4 && "agent-cell-wide")}
      initial={false} whileHover={reduced ? undefined : { backgroundColor: "#e7f0ea" }}
      transition={{ duration: 0.2 }}>
      <div className="agent-cell-title"><span aria-hidden="true">{item.icon}</span><h3>{item.title}</h3></div>
      {item.render(item.defaultSpan === 4 ? "l" : "s")}
    </motion.article>)}
  </div>;
}
