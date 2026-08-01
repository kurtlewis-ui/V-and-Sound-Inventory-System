'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { useDraftStore, type DraftItem } from '@/lib/draft';
import { useSaveDraft, useClearDraftSync, useSaveMyDraft, useMyDraftExists } from '@/lib/hooks';
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
  Recycle,
  Receipt,
  Settings as SettingsIcon,
} from 'lucide-react';

function peso(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
// Draft order "bag": floating button + slide-in panel with three sections —
// items to sell, items to dispose, and expenses to log. A single "Save
// Order" submits everything together (creates the sale + disposal(s) +
// expense(s), all PENDING, awaiting admin approval).
// ---------------------------------------------------------------------------

// Payment is chosen per item (in the Add Purchase modal), not once for the
// whole order — this renders each item's choice as a small tag.
function paymentTagLabel(item: DraftItem) {
  if (item.paymentMethod === 'BankTransfer' && item.bankNote) return `Bank Transfer (${item.bankNote})`;
  if (item.paymentMethod === 'Split') return 'Split';
  if (item.paymentMethod === 'Cashless') return 'Cashless';
  return item.paymentMethod;
}

function DraftBag() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const {
    items,
    setQuantity,
    removeItem,
    disposalItems,
    setDisposalQuantity,
    removeDisposalItem,
    expenses,
    addExpense,
    removeExpense,
    clear,
  } = useDraftStore();
  const [customerName, setCustomerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [addingExpense, setAddingExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNote, setExpenseNote] = useState('');
  const saveDraft = useSaveDraft();
  const clearDraftSync = useClearDraftSync();
  const saveMyDraft = useSaveMyDraft();
  const { data: myDraftExists } = useMyDraftExists();

  useEffect(() => setMounted(true), []);

  const isEmpty = items.length === 0 && disposalItems.length === 0 && expenses.length === 0;

  // Push the cart to the server (debounced) so Admins can see it live on
  // Pending Sales before it's ever submitted. Skips the initial mount so an
  // empty cart on page load doesn't fire a pointless clear.
  const didMount = useRef(false);
  const lastLocalEditAt = useRef(0);
  useEffect(() => {
    lastLocalEditAt.current = Date.now();
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const timer = setTimeout(() => {
      if (isEmpty) {
        clearDraftSync.mutate();
      } else {
        saveDraft.mutate({
          items,
          disposalItems,
          expenses,
          customerName: customerName.trim() || undefined,
        });
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, disposalItems, expenses, customerName]);

  // If the server-side draft disappeared while we weren't actively editing
  // (nothing changed locally in the last few seconds), it wasn't us — an
  // admin must have submitted it on our behalf via "Save Draft". Clear the
  // stale local copy so we don't resubmit those same items as duplicates.
  useEffect(() => {
    if (!myDraftExists || myDraftExists.exists || isEmpty) return;
    if (Date.now() - lastLocalEditAt.current < 3000) return;
    clear();
    setSuccess("Your draft was submitted by an admin — it's no longer pending here.");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myDraftExists]);

  const itemsTotal = useMemo(
    () => items.reduce((sum, i) => sum + i.unitPrice * i.quantity - (i.discount ?? 0), 0),
    [items],
  );
  const expensesTotal = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amount, 0),
    [expenses],
  );
  // Live rollup of what's staged so far, by payment method — splits an
  // item's Split-payment breakdown across its buckets. Line totals are
  // net of each item's discount.
  const paymentTotals = useMemo(() => {
    const totals = { cash: 0, gcash: 0, bankTransfer: 0, cashless: 0 };
    for (const item of items) {
      const lineTotal = item.unitPrice * item.quantity - (item.discount ?? 0);
      if (item.paymentMethod === 'Split' && item.paymentSplit) {
        totals.cash += item.paymentSplit.cash;
        totals.gcash += item.paymentSplit.gcash;
        totals.bankTransfer += item.paymentSplit.bankTransfer;
        totals.cashless += item.paymentSplit.cashless;
      } else if (item.paymentMethod === 'Cash') totals.cash += lineTotal;
      else if (item.paymentMethod === 'Gcash') totals.gcash += lineTotal;
      else if (item.paymentMethod === 'BankTransfer') totals.bankTransfer += lineTotal;
      else if (item.paymentMethod === 'Cashless') totals.cashless += lineTotal;
    }
    return totals;
  }, [items]);
  const count =
    items.reduce((sum, i) => sum + i.quantity, 0) +
    disposalItems.reduce((sum, i) => sum + i.quantity, 0) +
    expenses.length;

  async function handleSave() {
    if (isEmpty) return;
    setError(null);
    setSuccess(null);
    try {
      // Flush the very latest state to the server first — the debounced sync
      // above may not have fired yet if the staff edited and immediately hit
      // Save — then ask the server to submit whatever it has on file.
      await saveDraft.mutateAsync({
        items,
        disposalItems,
        expenses,
        customerName: customerName.trim() || undefined,
      });
      const result = await saveMyDraft.mutateAsync();
      clear();
      setCustomerName('');
      if (result.errors.length > 0) {
        // Whatever succeeded is already submitted; only the failed part (if
        // any) is still sitting in the server-side draft for a retry later —
        // stay put so the staff can see what failed instead of navigating
        // away from it.
        setError(`Some items couldn't be submitted: ${result.errors.join('; ')}`);
      } else {
        setSuccess('Order submitted! It now awaits admin approval.');
        setOpen(false);
        router.push('/staff/reports');
      }
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  }

  function handleClear() {
    clear();
    clearDraftSync.mutate();
  }

  function handleAddExpense() {
    const amount = Number(expenseAmount);
    if (!amount || amount <= 0) {
      setError('Enter a valid expense amount.');
      return;
    }
    if (!expenseNote.trim()) {
      setError('Add a note for the expense (e.g. "Water bill").');
      return;
    }
    setError(null);
    addExpense({ amount, note: expenseNote.trim() });
    setExpenseAmount('');
    setExpenseNote('');
    setAddingExpense(false);
  }

  const isSaving = saveDraft.isPending || saveMyDraft.isPending;

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

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* To Sell */}
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <Briefcase size={13} /> To Sell
                </h4>
                {items.length === 0 ? (
                  <div className="rounded-lg border border-card-border bg-white/5 px-4 py-3 text-center text-sm text-text-muted">
                    No items yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((item) => (
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
                          <p className="text-xs text-text-secondary">
                            {peso(item.unitPrice)} each &middot; {peso(item.unitPrice * item.quantity - (item.discount ?? 0))} total
                            {!!item.discount && <span className="text-accent-orange"> (−{peso(item.discount)} discount)</span>}
                          </p>
                          <span className="mt-0.5 inline-block rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-purple-light">{paymentTagLabel(item)}</span>
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
                        <button onClick={() => removeItem(item.productId)} className="rounded p-1.5 text-accent-red hover:bg-accent-red/10" title="Remove"><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* To Dispose */}
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <Recycle size={13} /> To Dispose
                </h4>
                {disposalItems.length === 0 ? (
                  <div className="rounded-lg border border-card-border bg-white/5 px-4 py-3 text-center text-sm text-text-muted">
                    No items staged for disposal.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {disposalItems.map((item) => (
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
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setDisposalQuantity(item.productId, item.quantity - 1)} className="rounded p-1 text-text-secondary hover:bg-white/10" aria-label="Decrease"><Minus size={14} /></button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => setDisposalQuantity(item.productId, parseInt(e.target.value) || 1)}
                            className="w-12 rounded border border-input-border bg-input-bg px-1 py-1 text-center text-sm"
                          />
                          <button onClick={() => setDisposalQuantity(item.productId, item.quantity + 1)} className="rounded p-1 text-text-secondary hover:bg-white/10" aria-label="Increase"><Plus size={14} /></button>
                        </div>
                        <button onClick={() => removeDisposalItem(item.productId)} className="rounded p-1.5 text-accent-red hover:bg-accent-red/10" title="Remove"><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Expenses */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    <Receipt size={13} /> Expenses
                  </h4>
                  {!addingExpense && (
                    <button
                      onClick={() => setAddingExpense(true)}
                      className="flex items-center gap-1 text-xs font-medium text-accent-blue hover:underline"
                    >
                      <Plus size={13} /> Add Expense
                    </button>
                  )}
                </div>

                {expenses.length === 0 && !addingExpense && (
                  <div className="rounded-lg border border-card-border bg-white/5 px-4 py-3 text-center text-sm text-text-muted">
                    No expenses logged.
                  </div>
                )}

                {expenses.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {expenses.map((exp, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg border border-card-border p-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary">{peso(exp.amount)}</p>
                          <p className="truncate text-xs text-text-muted">{exp.note}</p>
                        </div>
                        <button onClick={() => removeExpense(idx)} className="rounded p-1.5 text-accent-red hover:bg-accent-red/10" title="Remove"><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                )}

                {addingExpense && (
                  <div className="rounded-lg border border-card-border p-3 space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Amount (₱)</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={expenseAmount}
                        onChange={(e) => setExpenseAmount(e.target.value)}
                        placeholder="300"
                        className="w-full rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Note</label>
                      <input
                        type="text"
                        value={expenseNote}
                        onChange={(e) => setExpenseNote(e.target.value)}
                        placeholder="Water bill"
                        className="w-full rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setAddingExpense(false); setExpenseAmount(''); setExpenseNote(''); }}
                        className="flex-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-white/15 transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddExpense}
                        className="flex-1 rounded-lg bg-btn-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {success && (
                <div className="rounded-lg bg-accent-green/10 border border-accent-green/30 px-3 py-2 text-sm text-accent-green flex items-center gap-2">
                  <CheckCircle2 size={16} /> {success}
                </div>
              )}
              {error && (
                <div className="rounded-lg bg-accent-red/10 border border-accent-red/30 px-3 py-2 text-sm text-accent-red">{error}</div>
              )}
            </div>

            {!isEmpty && (
              <div className="border-t border-card-border p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Customer (optional)</label>
                  <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full border border-input-border rounded px-2 py-1.5 text-sm bg-input-bg" />
                </div>
                <div className="space-y-1 text-sm">
                  {items.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Items Total</span>
                      <span className="font-medium text-text-primary">{peso(itemsTotal)}</span>
                    </div>
                  )}
                  {items.length > 0 && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-text-secondary">Total Cash</span>
                        <span className="text-text-primary">{peso(paymentTotals.cash)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-text-secondary">Total Gcash</span>
                        <span className="text-text-primary">{peso(paymentTotals.gcash)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-text-secondary">Total Bank Transfer</span>
                        <span className="text-text-primary">{peso(paymentTotals.bankTransfer)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-text-secondary">Total Cashless</span>
                        <span className="text-text-primary">{peso(paymentTotals.cashless)}</span>
                      </div>
                    </>
                  )}
                  {expenses.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Expenses Total</span>
                      <span className="font-medium text-text-primary">{peso(expensesTotal)}</span>
                    </div>
                  )}
                  {items.length > 0 && expenses.length > 0 && (
                    <div className="flex items-center justify-between border-t border-card-border pt-1">
                      <span className="font-semibold text-text-primary">Net (this order)</span>
                      <span className="font-bold text-text-primary">{peso(itemsTotal - expensesTotal)}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={handleClear} disabled={isSaving} className="flex-1 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-text-primary hover:bg-white/15 transition disabled:opacity-60">Clear</button>
                  <button onClick={handleSave} disabled={isSaving} className="flex-[2] btn-grad rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
                    {isSaving ? 'Saving...' : 'Save Order'}
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
