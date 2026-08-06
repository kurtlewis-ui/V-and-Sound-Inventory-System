'use client';

import { Fragment, useMemo, useState } from 'react';
import { Search, Loader2, X, Recycle } from 'lucide-react';
import {
  useSalesRecords,
  useSalesPending,
  useDisposals,
  useDisposalsPending,
  useExpenses,
  useBranchSummary,
} from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { getApiErrorMessage } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';

function peso(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function itemPaymentLabel(item: { paymentMethod: string; bankNote?: string | null; paymentSplit?: { cash: number; gcash: number; bankTransfer: number; cashless: number } | null }) {
  if (item.paymentMethod === 'Split' && item.paymentSplit) {
    const parts: string[] = [];
    if (item.paymentSplit.cash > 0) parts.push(`₱${item.paymentSplit.cash.toLocaleString(undefined, { minimumFractionDigits: 2 })} Cash`);
    if (item.paymentSplit.gcash > 0) parts.push(`₱${item.paymentSplit.gcash.toLocaleString(undefined, { minimumFractionDigits: 2 })} Gcash`);
    if (item.paymentSplit.bankTransfer > 0) parts.push(`₱${item.paymentSplit.bankTransfer.toLocaleString(undefined, { minimumFractionDigits: 2 })} Bank`);
    if (item.paymentSplit.cashless > 0) parts.push(`₱${item.paymentSplit.cashless.toLocaleString(undefined, { minimumFractionDigits: 2 })} Cashless`);
    return parts.join(' · ') || 'Split';
  }
  if (item.paymentMethod === 'BankTransfer') return `Bank Transfer${item.bankNote ? ` (${item.bankNote})` : ''}`;
  return item.paymentMethod;
}
function todayLocalDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
// A submitted item is visible on the report the instant it's saved — tagged
// Pending until an admin decides it. Approval just drops the tag (the row
// stays put); decline removes it from here entirely (and copies it back
// into the staff's draft cart instead — see the DraftBag).
function PendingTag({ status }: { status: string }) {
  if (status !== 'PENDING') return null;
  return (
    <span className="ml-2 rounded-full bg-accent-orange/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-orange">
      Pending
    </span>
  );
}

type ViewMode = 'sale' | 'product';

export default function StaffDailyReportPage() {
  const [view, setView] = useState<ViewMode>('sale');
  const [search, setSearch] = useState('');
  const [showDisposals, setShowDisposals] = useState(false);

  const branchName = useAuthStore((s) => s.user?.branch?.name);
  const today = useMemo(() => todayLocalDate(), []);

  const { data, isLoading, isError, error } = useSalesRecords({
    search: search || undefined,
    startDate: today,
    endDate: today,
  });
  const approvedSales = data?.data ?? [];
  const summary = data?.summary ?? { cash: 0, gcash: 0, bankTransfer: 0, cashless: 0, total: 0, count: 0 };

  const { data: pendingData } = useSalesPending({
    search: search || undefined,
    startDate: today,
    endDate: today,
  });
  const pendingSales = pendingData?.data ?? [];

  // Today's full picture: still-pending submissions alongside approved
  // ones, oldest first (so the day reads top-to-bottom in the order it
  // happened) — declined ones are excluded (they get copied back into the
  // draft cart instead of lingering here).
  const sales = useMemo(
    () =>
      [...pendingSales, ...approvedSales].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [pendingSales, approvedSales],
  );

  const { data: disposalsData } = useDisposals({ startDate: today, endDate: today });
  const todaysDisposals = (disposalsData?.data ?? []).filter((d) => d.status !== 'DECLINED');

  const { data: expensesData } = useExpenses({ startDate: today, endDate: today });
  const todaysExpenses = (expensesData?.data ?? []).filter((e) => e.status !== 'DECLINED');

  const { data: branchSummary } = useBranchSummary();

  // Aggregate items across today's sales (pending + approved) for "View by Product".
  const productRows = useMemo(() => {
    const map = new Map<string, { name: string; brandName: string; quantity: number; total: number }>();
    for (const sale of sales) {
      for (const item of sale.items) {
        const key = `${item.name}__${item.brandName}`;
        const cur = map.get(key) ?? { name: item.name, brandName: item.brandName, quantity: 0, total: 0 };
        cur.quantity += item.quantity;
        cur.total += item.subTotal;
        map.set(key, cur);
      }
    }
    let rows = [...map.values()];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.brandName.toLowerCase().includes(q));
    }
    return rows.sort((a, b) => b.total - a.total);
  }, [sales, search]);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          {branchName && (
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1">{branchName}</p>
          )}
          <h1 className="text-2xl font-bold text-text-primary">Daily Report</h1>
          <p className="mt-0.5 text-xs text-text-muted">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => setShowDisposals(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent-red px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
        >
          <Recycle size={16} /> Disposals
        </button>
      </div>

      <div className="mb-3 max-w-xs">
        <select
          value={view}
          onChange={(e) => setView(e.target.value as ViewMode)}
          className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
        >
          <option value="sale">View by Sale</option>
          <option value="product">View by Product</option>
        </select>
      </div>

      <div className="mb-4 flex max-w-2xl items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input-border bg-input-bg py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
          />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={8} />
      ) : isError ? (
        <div className="py-10 text-center text-accent-red">{getApiErrorMessage(error)}</div>
      ) : sales.length === 0 ? (
        <div className="inline-block rounded-lg border border-accent-orange/40 bg-accent-orange/10 px-4 py-2 text-sm text-accent-orange">
          No sales available.
        </div>
      ) : view === 'sale' ? (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card-bg shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Sale</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Qty</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Price</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Sub Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <Fragment key={sale.id}>
                  {sale.items.map((item, idx) => (
                    <tr key={item.id} className="border-t border-card-border">
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">
                        {idx === 0 && (
                          <>
                            {`#${sale.number}`}
                            <PendingTag status={sale.status} />
                            {sale.customerName && (
                              <p className="text-[10px] font-normal text-accent-blue mt-0.5">{sale.customerName}</p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-primary">
                        {item.name}
                        {item.note && <p className="text-[10px] text-text-muted italic mt-0.5">{item.note}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-primary">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{item.brandName}</td>
                      <td className="px-4 py-3 text-sm text-text-primary">{peso(item.unitPrice)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">
                        {peso(item.subTotal)}
                        {!!item.discount && <p className="text-xs font-normal text-accent-orange">−{peso(item.discount)} discount</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary max-w-[200px]">
                        <span className="break-words">{itemPaymentLabel(item)}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{idx === 0 ? formatDate(sale.createdAt) : ''}</td>
                    </tr>
                  ))}
                  <tr className="bg-surface-muted border-t border-card-border">
                    <td colSpan={8} className="px-4 py-2 text-sm font-semibold text-accent-purple-light">
                      Total for Sale #{sale.number}: {peso(sale.total)}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card-bg shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Qty Sold</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {productRows.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-text-muted">No products match your search.</td></tr>
              ) : (
                productRows.map((r) => (
                  <tr key={`${r.name}-${r.brandName}`} className="border-t border-card-border">
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{r.name}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{r.brandName}</td>
                    <td className="px-4 py-3 text-sm text-text-primary">{r.quantity}</td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{peso(r.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary — approved sales only, so it isn't inflated by unconfirmed pending amounts */}
      <div className="mt-4 rounded-xl border border-card-border bg-card-bg p-4 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-2">Totals below reflect approved sales only — pending sales are not included.</p>
        <div className="border-l-4 border-accent-blue pl-4 text-right space-y-1">
          <p className="text-sm text-text-secondary">Total for Cash: <span className="font-medium text-text-primary">{peso(summary.cash)}</span></p>
          <p className="text-sm text-text-secondary">Total for Gcash: <span className="font-medium text-text-primary">{peso(summary.gcash)}</span></p>
          <p className="text-sm text-text-secondary">Total for Bank Transfer: <span className="font-medium text-text-primary">{peso(summary.bankTransfer)}</span></p>
          <p className="text-sm text-text-secondary">Total for Cashless: <span className="font-medium text-text-primary">{peso(summary.cashless)}</span></p>
          <p className="text-sm font-bold text-text-primary">Total for All Sales: {peso(summary.total)}</p>
        </div>
      </div>

      {/* Today's Disposals — pending (tagged) + approved, declined excluded */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-card-border bg-card-bg shadow-sm">
        <div className="border-b border-card-border p-4">
          <h2 className="text-sm font-bold text-text-primary">Today&apos;s Disposals</h2>
        </div>
        {todaysDisposals.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">No disposals today.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Qty</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Value</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {todaysDisposals.map((d) => (
                <tr key={d.id} className="border-t border-card-border">
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    {d.name}<PendingTag status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.brandName}</td>
                  <td className="px-4 py-3 text-sm text-text-primary">{d.quantity}</td>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{peso(d.value)}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.reason ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Today's Expenses — pending (tagged) + approved, declined excluded */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-card-border bg-card-bg shadow-sm">
        <div className="border-b border-card-border p-4">
          <h2 className="text-sm font-bold text-text-primary">Today&apos;s Expenses</h2>
        </div>
        {todaysExpenses.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">No expenses today.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Note</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {todaysExpenses.map((e) => (
                <tr key={e.id} className="border-t border-card-border">
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    {peso(e.amount)}<PendingTag status={e.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{e.note}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Today's net — approved sales minus approved expenses, live */}
      {branchSummary && (
        <div className="mt-4 rounded-xl border border-card-border bg-card-bg p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Today (Approved)</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-text-secondary">Total Sales</p>
              <p className="text-lg font-bold text-accent-green">{peso(branchSummary.totalSales)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Total Expenses</p>
              <p className="text-lg font-bold text-accent-red">{peso(branchSummary.totalExpenses)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Net</p>
              <p className="text-lg font-bold text-text-primary">{peso(branchSummary.net)}</p>
            </div>
          </div>
        </div>
      )}

      {showDisposals && <PendingDisposalsModal onClose={() => setShowDisposals(false)} />}
    </div>
  );
}

function PendingDisposalsModal({ onClose }: { onClose: () => void }) {
  const { data, isLoading, isError, error } = useDisposalsPending();
  const disposals = data?.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-lg border border-card-border bg-card-bg p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-text-primary">Pending Disposals</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>
        {isLoading ? (
          <div className="py-6 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading...</div>
        ) : isError ? (
          <div className="py-6 text-center text-accent-red">{getApiErrorMessage(error)}</div>
        ) : disposals.length === 0 ? (
          <div className="rounded-lg border-l-4 border-accent-blue bg-white/5 px-4 py-3 text-sm text-text-secondary">
            No pending disposals for your shop.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {disposals.map((d) => (
              <div key={d.id} className="rounded-lg border border-card-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-text-primary">{d.name}</p>
                  <span className="text-sm text-text-secondary">Qty: {d.quantity}</span>
                </div>
                <p className="text-xs text-text-muted">{d.brandName} · {peso(d.value)}{d.reason ? ` · ${d.reason}` : ''}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
