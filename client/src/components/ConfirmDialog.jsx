import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="card-pad relative w-full max-w-sm animate-fade-slide-in">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/15">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
        </div>
        <h3 className="mb-1 text-lg font-bold text-white">{title}</h3>
        <p className="mb-5 text-sm text-slate-400">{message}</p>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary !px-4 !py-2 text-sm" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-danger !px-4 !py-2 text-sm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
