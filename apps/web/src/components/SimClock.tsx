import { useEffect, useRef } from "react";
import { useSimTime } from "../hooks/SimTimeContext";

/** Must match apps/server/src/sim/clock.ts autorun interval. */
export const AUTORUN_MS = 20_000;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

function simCalendar(day: number, msOfDay: number) {
  const start = Date.UTC(2026, 0, 1, 0, 0, 0) + Math.max(0, day - 1) * DAY_MS;
  return new Date(start + Math.min(DAY_MS - 1, Math.max(0, msOfDay)));
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function SimClock({ compact = false }: { compact?: boolean }) {
  const { simDay, msOfDay, autorun, paused, setMsOfDay } = useSimTime();
  const cycleStart = useRef(performance.now());
  const dayRef = useRef(simDay);
  const lastMinute = useRef(-1);

  useEffect(() => {
    if (simDay !== dayRef.current) {
      dayRef.current = simDay;
      cycleStart.current = performance.now();
      lastMinute.current = -1;
      setMsOfDay(autorun && !paused ? 0 : 12 * 60 * 60 * 1000);
    }
  }, [simDay, autorun, paused, setMsOfDay]);

  useEffect(() => {
    if (!autorun || paused || simDay < 1) {
      if (!autorun || paused) {
        lastMinute.current = -1;
        setMsOfDay(12 * 60 * 60 * 1000);
      }
      return;
    }
    cycleStart.current = performance.now();
    lastMinute.current = -1;
    let frame = 0;
    const tick = () => {
      const elapsed = performance.now() - cycleStart.current;
      const progress = Math.min(1, elapsed / AUTORUN_MS);
      const next = Math.floor((progress * (DAY_MS - MINUTE_MS)) / MINUTE_MS) * MINUTE_MS;
      const minuteIndex = next / MINUTE_MS;
      if (minuteIndex !== lastMinute.current) {
        lastMinute.current = minuteIndex;
        setMsOfDay(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [autorun, paused, simDay, setMsOfDay]);

  const day = Math.max(0, simDay);
  const when = simCalendar(day || 1, msOfDay);
  const hours = when.getUTCHours();
  const minutes = when.getUTCMinutes();
  const progress = msOfDay / DAY_MS;
  const phase =
    hours < 5 ? "Night" :
    hours < 8 ? "Dawn" :
    hours < 12 ? "Morning" :
    hours < 17 ? "Afternoon" :
    hours < 20 ? "Evening" : "Night";

  if (compact) {
    return (
      <div className={`sim-clock-compact ${autorun && !paused ? "running" : ""}`} aria-live="polite" title={autorun && !paused ? "Auto-run scrubbing the sim day" : "Midday snapshot"}>
        <strong>Day {day || "…"}</strong>
        <span className="sim-clock-hms">{pad(hours)}:{pad(minutes)}</span>
        <span className="sim-clock-phase">{phase}</span>
        <div className="sim-clock-track compact" aria-hidden>
          <div className="sim-clock-fill" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className={`sim-clock ${autorun && !paused ? "running" : ""}`} aria-live="polite">
      <div className="sim-clock-main">
        <div className="sim-clock-day">Day {day || "…"}</div>
        <div className="sim-clock-time">
          <span className="sim-clock-hms">{pad(hours)}:{pad(minutes)}</span>
          <span className="sim-clock-phase">{phase}</span>
        </div>
        <div className="sim-clock-date">
          {when.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
        </div>
      </div>
      <div className="sim-clock-track" aria-hidden>
        <div className="sim-clock-fill" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        <div className="sim-clock-marks">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
        </div>
      </div>
      {autorun && !paused && <div className="sim-clock-hint">Auto-run · orders appear as sim time reaches them · day rolls every {AUTORUN_MS / 1000}s</div>}
      {paused && <div className="sim-clock-hint">Agents paused</div>}
      {!autorun && !paused && <div className="sim-clock-hint">Midday snapshot · turn on Auto-run to scrub through the day</div>}
    </div>
  );
}
