'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type ToastType = 'success' | 'error';
type ToastColor = 'green' | 'blue' | 'yellow' | 'orange' | 'red';

interface Toast {
  id: number;
  message: string;
  title: string;
  type: ToastType;
  color: ToastColor;
  exiting?: boolean;
  duration: number;
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

const barColorMap: Record<ToastColor, string> = {
  green: 'bg-emerald-400',
  blue: 'bg-blue-400',
  yellow: 'bg-amber-400',
  orange: 'bg-orange-400',
  red: 'bg-red-400',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
  }, []);

  const showToast = useCallback((message: string, color: ToastColor = 'green') => {
    const id = ++toastId;
    const duration = 3500;
    setToasts((prev) => [...prev, { id, message, title: 'Success!', type: 'success', color, duration }]);
    setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const showError = useCallback((message: string) => {
    const id = ++toastId;
    const duration = 4500;
    setToasts((prev) => [...prev, { id, message, title: 'Error', type: 'error', color: 'red', duration }]);
    setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast, showError }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-lg border border-[#e0e0e0] dark:border-[#333] bg-white dark:bg-[#1a1a1a] shadow-lg transition-all duration-300 overflow-hidden ${toast.exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}`}
            style={{ minWidth: '260px', maxWidth: '340px' }}
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 text-base leading-none">{toast.type === 'success' ? '✓' : '✕'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#1a1a1a] dark:text-white">{toast.title}</p>
                <p className="text-xs text-[#666] dark:text-[#999] mt-0.5">{toast.message}</p>
              </div>
            </div>
            <div className="h-[3px] w-full bg-[#f0f0f0] dark:bg-[#2a2a2a]">
              <div
                className={`h-full ${barColorMap[toast.color]} rounded-r`}
                style={{ animation: `toast-drain ${toast.duration}ms linear forwards` }}
              />
            </div>
          </div>
        ))}
      </div>
      <style jsx global>{`
        @keyframes toast-drain {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
