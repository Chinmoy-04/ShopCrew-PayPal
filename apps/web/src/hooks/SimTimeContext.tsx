import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type SimTime = {
  simDay: number;
  /** Milliseconds from midnight in the sim day (minute precision). */
  msOfDay: number;
  autorun: boolean;
  paused: boolean;
  setSimMeta: (meta: { simDay: number; autorun: boolean; paused: boolean }) => void;
  setMsOfDay: (ms: number) => void;
};

const Ctx = createContext<SimTime | null>(null);

export function SimTimeProvider({ children }: { children: ReactNode }) {
  const [simDay, setSimDay] = useState(0);
  const [msOfDay, setMsOfDay] = useState(12 * 60 * 60 * 1000);
  const [autorun, setAutorun] = useState(false);
  const [paused, setPaused] = useState(false);

  const value = useMemo<SimTime>(
    () => ({
      simDay,
      msOfDay,
      autorun,
      paused,
      setSimMeta: (meta) => {
        setSimDay(meta.simDay);
        setAutorun(meta.autorun);
        setPaused(meta.paused);
      },
      setMsOfDay,
    }),
    [simDay, msOfDay, autorun, paused],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSimTime() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSimTime needs SimTimeProvider");
  return ctx;
}
