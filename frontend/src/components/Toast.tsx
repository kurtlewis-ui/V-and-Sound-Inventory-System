'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { Check, RotateCcw, Archive, Trash2, X } from 'lucide-react';

type ToastColor = 'green' | 'blue' | 'yellow' | 'orange' | 'red';
type ToastIcon = 'check' | 'restore' | 'archive' | 'trash' | 'x';

interface Toast {
  id: number;
  message: string;
  title: string;
  color: ToastColor;
  icon: ToastIcon;
  exiting?: boolean;
  duration: number;
}

interface ToastContextType {
  showToast: (message: string, color?: ToastColor, icon?: ToastIcon) => void;
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

const iconColorMap: Record<ToastColor, string> = {
  green: 'text-emerald-500',
  blue: 'text-blue-500',
  yellow: 'text-amber-500',
  orange: 'text-orange-500',
  red: 'text-red-500',
};

function ToastIconComponent({ icon, color }: { icon: ToastIcon; color: ToastColor }) {
  const cls = `${iconColorMap[color]}`;
  switch (icon) {
    case 'check': return <Check size={16} strokeWidth={2.5} className={cls} />;
    case 'restore': return <RotateCcw size={16} strokeWidth={2} className={cls} />;
    case 'archive': return <Archive size={16} strokeWidth={2} className={cls} />;
    case 'trash': return <Trash2 size={16} strokeWidth={2} className={cls} />;
    case 'x': return <X size={16} strokeWidth={2.5} className={cls} />;
    default: return <Check size={16} strokeWidth={2.5} className={cls} />;
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
  }, []);

  const showToast = useCallback((message: string, color: ToastColor = 'green', icon?: ToastIcon) => {
    const id = ++toastId;
    const duration = 3500;
    const resolvedIcon = icon ?? (color === 'green' ? 'check' : color === 'blue' ? 'check' : color === 'orange' ? 'archive' : color === 'red' ? 'trash' : 'check');
    setToasts((prev) => [...prev, { id, message, title: 'Success!', color, icon: resolvedIcon, duration }]);
    setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const showError = useCallback((message: string) => {
    const id = ++toastId;
    const duration = 4500;
    setToasts((prev) => [...prev, { id, message, title: 'Error', color: 'red', icon: 'x', duration }]);
    setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast, showError }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] shadow-xl overflow-hidden transition-all duration-300 ease-out ${toast.exiting ? 'opacity-0 translate-x-6 scale-95' : 'opacity-100 translate-x-0 scale-100'}`}
            style={{ minWidth: '260px', maxWidth: '320px', animation: toast.exiting ? undefined : 'toast-in 0.3s ease-out' }}
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5"><ToastIconComponent icon={toast.icon} color={toast.color} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{toast.title}</p>
                <p className="text-xs text-[#999] mt-0.5">{toast.message}</p>
              </div>
              <button onClick={() => dismiss(toast.id)} className="text-[#666] hover:text-white transition mt-0.5"><X size={13} /></button>
            </div>
            <div className="h-[2px] w-full bg-[#2a2a2a]">
              <div className={`h-full ${barColorMap[toast.color]}`} style={{ animation: `toast-drain ${toast.duration}ms linear forwards` }} />
            </div>
          </div>
        ))}
      </div>
      <style jsx global>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(20px) scale(0.95); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes toast-drain {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
