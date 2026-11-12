import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (type, message, ms = 4000, opts = {}) => {
      // Phase 4: respect the localStorage notification preference. Error
      // toasts are critical and always shown; everything else can be muted
      // from Settings. Default is enabled.
      if (type !== 'error') {
        try {
          const prefs = JSON.parse(localStorage.getItem('qa-prefs') || '{}');
          if (prefs.toasts === false) return -1;
        } catch {
          /* malformed prefs — show the toast */
        }
      }
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-4), { id, type, message, action: opts.action || null }]);
      timers.current.set(id, setTimeout(() => dismiss(id), ms));
      return id;
    },
    [dismiss]
  );

  const toast = {
    success: (msg, ms) => push('success', msg, ms),
    error: (msg, ms) => push('error', msg, ms || 5000),
    info: (msg, ms) => push('info', msg, ms),
    // Phase 2: toast with an inline action button, e.g. rematch "Join".
    // action = { label, onClick }. ms defaults to 60s for offers.
    action: (type, msg, action, ms = 60000) => push(type, msg, ms, { action }),
  };

  return <ToastContext.Provider value={{ toasts, toast, dismiss }}>{children}</ToastContext.Provider>;
}
