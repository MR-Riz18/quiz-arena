import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useToast } from '../context/ToastContext.jsx';
import { cn } from '../utils/cn.js';

const ICONS = {
  success: <CheckCircle2 className="h-5 w-5 text-green-400" />,
  error: <AlertCircle className="h-5 w-5 text-red-400" />,
  info: <Info className="h-5 w-5 text-brand-blue" />,
};

export default function ToastStack() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex animate-toast-in items-start gap-3 rounded-xl border bg-navy-900/95 p-3.5 shadow-2xl backdrop-blur',
            t.type === 'success' && 'border-green-500/40',
            t.type === 'error' && 'border-red-500/40',
            t.type === 'info' && 'border-brand-blue/40'
          )}
          role="status"
        >
          <span className="mt-0.5 shrink-0">{ICONS[t.type]}</span>
          <div className="flex-1">
            <p className="text-sm text-slate-100">{t.message}</p>
            {t.action && (
              <button
                onClick={() => {
                  t.action.onClick?.();
                  dismiss(t.id);
                }}
                className="mt-2 rounded-lg bg-gradient-to-r from-brand-blue to-brand-violet px-3 py-1.5 text-xs font-bold text-navy-950 transition hover:brightness-110"
              >
                {t.action.label}
              </button>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 rounded p-0.5 text-slate-500 hover:text-white"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
