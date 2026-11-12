import { createContext, useContext, useState, type ReactNode } from "react";
type Failure = { message: string; retry: () => void } | null;
const Feedback = createContext<(failure: Failure) => void>(() => {});
export const useWidgetFeedback = () => useContext(Feedback);
export function WidgetFeedback({ children }: { children: ReactNode }) {
  const [failure, setFailure] = useState<Failure>(null);
  return (
    <Feedback.Provider value={setFailure}>
      {children}
      {failure && (
        <div className="insight-widget-error" role="alert">
          {failure.message}{" "}
          <button type="button" onClick={failure.retry}>
            Retry widget
          </button>
        </div>
      )}
    </Feedback.Provider>
  );
}
