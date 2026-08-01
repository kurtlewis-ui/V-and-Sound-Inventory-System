'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { useDraftStore } from '@/lib/draft';
import { useCreateSale, useSaveDraft, useClearDraftSync } from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';
import {
  Home,
  ClipboardList,
  Package,
  Briefcase,
  LogOut,
  X,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Settings as SettingsIcon,
} from 'lucide-react';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const navItems = [
  { label: 'Home', href: '/staff', icon: <Home size={16} /> },
  { label: 'Daily Reports', href: '/staff/reports', icon: <ClipboardList size={16} /> },
  { label: 'Products', href: '/staff/products', icon: <Package size={16} /> },
];

export default function StaffLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, accessToken, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Auth + role guard: must be logged in and a Staff account.
  useEffect(() => {
    if (!mounted) return;
    if (!accessToken) {
      router.replace('/login');
    } else if (user && user.role?.name !== 'Staff') {
      // Admins/owners belong in the admin dashboard.
      router.replace('/dashboard');
    }
  }, [mounted, accessToken, user, router]);

  function handleLogout() {
    logout();
    // Clear the draft cart too — it's a separate localStorage key that would
    // otherwise survive logout and show up for the next person to sign in on
    // this (often shared, POS-style) device.
    useDraftStore.getState().clear();
    router.replace('/login');
  }

  const isActive = (href: string) =>
    href === '/staff' ? pathname === '/staff' : pathname.startsWith(href);

  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page-bg">
        <p className="text-text-secondary">Loading...</p>
      </main>
    );
  }
  if (!accessToken || (user && user.role?.name !== 'Staff')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-page-bg">
      <header className="sticky top-0 z-40 bg-nav-bg/80 backdrop-blur-md border-b border-nav-border shadow-sm shadow-black/20">
        <div className="flex items-center justify-between px-6 py-3">
          <Link href="/staff" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary text-sm font-bold text-white">
              V
            </span>
            <span className="text-lg font-bold text-text-primary">Vape Shop</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {user?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary text-xs font-bold text-white">
                  {user?.firstName?.[0]}
                  {user?.lastName?.[0]}
                </div>
              )}
              <div className="hidden sm:block leading-tight">
                <p className="text-sm font-medium text-text-primary">
                  {user?.firstName} {user?.lastName}
                </p>
                {user?.branch?.name && (
                  <p className="text-xs text-text-muted">{user.branch.name}</p>
                )}
              </div>
            </div>
            <Link
              href="/staff/settings"
              className="flex items-center rounded-lg p-2 text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
              title="Settings"
              aria-label="Settings"
            >
              <SettingsIcon size={16} />
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 rounded-lg p-2 text-sm text-text-secondary hover:text-accent-red hover:bg-accent-red/10 transition-colors"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-1 px-6 pb-2">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                  active
                    ? 'bg-accent-primary/15 text-accent-purple-light shadow-sm shadow-accent-primary/10'
                    : 'text-nav-text hover:text-text-primary hover:bg-white/5'
                }`}
              >
                <span className="text-accent-primary">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="px-6 py-6 max-w-[1200px] mx-auto">{children}</main>

      <DraftBag />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft order "bag": floating button + slide-in panel. Submitting creates a
// PENDING sale for the staff's branch (backend assigns the branch).
// ---------------------------------------------------------------------------
function DraftBag() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { items, setQuantity, removeItem, clear } = useDraftStore();
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Gcash'>('Cash');
  const [customerName, setCustomerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const createSale = useCreateSale();
  const saveDraft = useSaveDraft();
  const clearDraftSync = useClearDraftSync();

  useEffect(() => setMounted(true), []);

  // Push the cart to the server (debounced) so Admins can see it on Pending
  // Sales before it's ever submitted. Skips the initial mount so an empty
  // cart on page load doesn't fire a pointless clear.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const timer = setTimeout(() => {
      if (items.length === 0) {
        clearDraftSync.mutate();
      } else {
        saveDraft.mutate({ items, paymentMethod, customerName: customerName.trim() || undefined });
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, paymentMethod, customerName]);

  const total = useMemo(
    () => items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    [items],
  );
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  async function handleSave() {
    if (items.length === 0) return;
    setError(null);
    setSuccess(null);
    try {
      await createSale.mutateAsync({
        paymentMethod,
        customerName: customerName.trim() || undefined,
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      });
      clear();
      clearDraftSync.mutate();
      setCustomerName('');
      setSuccess('Order submitted! It now awaits admin approval in Pending Sales.');
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  }

  function handleClear() {
    clear();
    clearDraftSync.mutate();
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => { setOpen((o) => !o); setSuccess(null); setError(null); }}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent-primary text-white shadow-lg shadow-accent-primary/30 hover:brightness-110 transition"
        title="Draft order"
        aria-label="Draft order"
      >
        <Briefcase size={22} />
        {mounted && count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent-red px-1.5 text-xs font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
          <div className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col bg-card-bg border-l border-card-border shadow-2xl">
            <div className="flex items-center justify-between border-b border-card-border p-4">
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Briefcase size={18} /> Draft Order
              </h3>
              <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary transition">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {items.length === 0 ? (
                <div className="rounded-lg border border-card-border bg-white/5 px-4 py-6 text-center text-sm text-text-muted">
                  No pending orders.
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.productId} className="flex items-center gap-3 rounded-lg border border-card-border p-2">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-white/10 flex items-center justify-center">
                      {item.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[9px] text-text-muted">No Img</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">{item.name}</p>
                      <p className="truncate text-xs text-text-muted">{item.brandName}</p>
                      <p className="text-xs text-text-secondary">{peso(item.unitPrice)} each</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setQuantity(item.productId, item.quantity - 1)} className="rounded p-1 text-text-secondary hover:bg-white/10" aria-label="Decrease"><Minus size={14} /></button>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => setQuantity(item.productId, parseInt(e.target.value) || 1)}
                        className="w-12 rounded border border-input-border bg-input-bg px-1 py-1 text-center text-sm"
                      />
                      <button onClick={() => setQuantity(item.productId, item.quantity + 1)} className="rounded p-1 text-text-secondary hover:bg-white/10" aria-label="Increase"><Plus size={14} /></button>
                    </div>
                    <button onClick={() => removeItem(item.productId)} className="rounded p-1.5 text-accent-red hover:bg-accent-red/10" title="Remove (decline) item"><Trash2 size={15} /></button>
                  </div>
                ))
              )}

              {success && (
                <div className="rounded-lg bg-accent-green/10 border border-accent-green/30 px-3 py-2 text-sm text-accent-green flex items-center gap-2">
                  <CheckCircle2 size={16} /> {success}
                </div>
              )}
              {error && (
                <div className="rounded-lg bg-accent-red/10 border border-accent-red/30 px-3 py-2 text-sm text-accent-red">{error}</div>
              )}
            </div>

            {items.length > 0 && (
              <div className="border-t border-card-border p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Payment</label>
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'Cash' | 'Gcash')} className="w-full border border-input-border rounded px-2 py-1.5 text-sm bg-input-bg">
                      <option value="Cash">Cash</option>
                      <option value="Gcash">Gcash</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Customer (optional)</label>
                    <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full border border-input-border rounded px-2 py-1.5 text-sm bg-input-bg" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Total</span>
                  <span className="font-bold text-text-primary">{peso(total)}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleClear} disabled={createSale.isPending} className="flex-1 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-text-primary hover:bg-white/15 transition disabled:opacity-60">Clear</button>
                  <button onClick={handleSave} disabled={createSale.isPending} className="flex-[2] btn-grad rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
                    {createSale.isPending ? 'Saving...' : 'Save Order'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
