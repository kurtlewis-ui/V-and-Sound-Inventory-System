'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

type ToastType = 'success' | 'error';
type ToastColor = 'green' | 'blue' | 'yellow' | 'orange' | 'red';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  color: ToastColor;
  exiting?: boolean;
}

interface ToastContextType {
  showToast: (message: string, color?: ToastColor) => void;
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
  showError: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let toastId = 0;

const colorMap: Record<ToastColor, string> = {
  green: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  yellow: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
  red: 'bg-red-500/10 border-red-500/30 text-red-400',
};

const iconColorMap: Record<ToastColor, string> = {
  green: 'text-emerald-400',
  blue: 'text-blue-400',
  yellow: 'text-amber-400',
  orange: 'text-orange-400',
  red: 'text-red-400',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
  }, []);

  const showToast = useCallback((message: string, color: ToastColor = 'green') => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type: 'success', color }]);
    setTimeout(() => dismiss(id), 3500);
  }, [dismiss]);

  const showError = useCallback((message: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type: 'error', color: 'red' }]);
    setTimeout(() => dismiss(id), 4500);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast, showError }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm transition-all duration-300 ${colorMap[toast.color]} ${toast.exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}`}
            style={{ minWidth: '280px', maxWidth: '400px' }}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 size={18} className={iconColorMap[toast.color]} />
            ) : (
              <XCircle size={18} className="text-red-400" />
            )}
            <p className="flex-1 text-sm font-medium">{toast.message}</p>
            <button onClick={() => dismiss(toast.id)} className="opacity-60 hover:opacity-100 transition"><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
