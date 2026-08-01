'use client';

import { Fragment, useEffect, useState } from 'react';
import { Search, Pencil, Trash2, X, CheckCircle, XCircle, Plus, Loader2, Recycle, ShoppingBag } from 'lucide-react';
import {
  useSalesPending,
  useBranches,
  useProducts,
  useApproveSale,
  useDeclineSale,
  useDeleteSale,
  useUpdateSale,
  useDisposalsPending,
  useApproveDisposal,
  useDeclineDisposal,
  useStaffDrafts,
} from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';
import type { Sale } from '@/lib/types';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card-bg border border-card-border rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text-primary">{title}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface EditRow {
  productId: string;
  quantity: number;
}

export default function SalesPendingPage() {
  const [search, setSearch] = useState('');
  const [selectedShop, setSelectedShop] = useState('');

  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];
  const { data: productData } = useProducts();
  const products = productData?.data ?? [];

  const { data, isLoading, isError, error } = useSalesPending({
    search,
    branchId: selectedShop || undefined,
  });
  const sales = data?.data ?? [];
  const summary = data?.summary ?? { cash: 0, gcash: 0, total: 0, count: 0 };

  const approveSale = useApproveSale();
  const declineSale = useDeclineSale();
  const deleteSale = useDeleteSale();
  const updateSale = useUpdateSale();

  // Pending disposals (admin approves/declines these too)
  const { data: disposalData, isLoading: dispLoading } = useDisposalsPending({
    search,
    branchId: selectedShop || undefined,
  });
  const disposals = disposalData?.data ?? [];
  const approveDisposal = useApproveDisposal();
  const declineDisposal = useDeclineDisposal();

  // Staff draft carts (not yet submitted) — read-only visibility for admins.
  const { data: draftsData, isLoading: draftsLoading } = useStaffDrafts(selectedShop || undefined);
  const drafts = draftsData ?? [];

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [deletingSale, setDeletingSale] = useState<Sale | null>(null);

  async function runSafe(fn: () => Promise<unknown>) {
    setActionError(null);
    setActionStatus(null);
    try { await fn(); } catch (e) { setActionError(getApiErrorMessage(e)); }
  }

  const handleApproveAll = () => {
    const n = sales.length;
    if (n === 0) return;
    runSafe(async () => {
      await Promise.all(sales.map((s) => approveSale.mutateAsync(s.id)));
      setActionStatus(`✓ All ${n} pending sale${n === 1 ? '' : 's'} have been approved.`);
    });
  };
  const handleDeclineAll = () => {
    const n = sales.length;
    if (n === 0) return;
    runSafe(async () => {
      await Promise.all(sales.map((s) => declineSale.mutateAsync(s.id)));
      setActionStatus(`✓ All ${n} pending sale${n === 1 ? '' : 's'} have been declined.`);
    });
  };

  const busy = approveSale.isPending || declineSale.isPending || deleteSale.isPending;

  return (
    <div className="p-6 bg-page-bg min-h-screen">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-text-primary">Pending Sales</h1>
        <div className="flex items-center gap-2">
          <button onClick={handleApproveAll} disabled={busy || sales.length === 0} className="flex items-center gap-1.5 px-4 py-2 bg-accent-green text-white rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-70">
            <CheckCircle size={16} /> Approve All
          </button>
          <button onClick={handleDeclineAll} disabled={busy || sales.length === 0} className="flex items-center gap-1.5 px-4 py-2 bg-accent-red text-white rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-70">
            <XCircle size={16} /> Decline All
          </button>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg bg-accent-red/10 border border-accent-red/30 px-4 py-2 text-sm text-accent-red">{actionError}</div>
      )}
      {actionStatus && (
        <div className="mb-4 rounded-lg bg-accent-green/10 border border-accent-green/30 px-4 py-2 text-sm text-accent-green font-medium">{actionStatus}</div>
      )}

      {/* Filters */}
      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm mb-4">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <select value={selectedShop} onChange={(e) => setSelectedShop(e.target.value)} className="px-3 py-2 border border-input-border rounded-lg text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus">
            <option value="">All Shops</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm">
        <div className="p-4 border-b border-card-border">
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" placeholder="Search pending sales..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-input-border rounded-lg bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" />
          </div>
        </div>

        <div className="overflow-x-auto">
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
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Staff</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading pending sales...</td></tr>
              ) : isError ? (
                <tr><td colSpan={10} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-text-muted">No pending sales.</td></tr>
              ) : sales.map((sale) => (
                <Fragment key={sale.id}>
                  {sale.items.map((item, idx) => (
                    <tr key={item.id} className="border-b border-card-border hover:bg-white/5 transition">
                      <td className="px-4 py-3 text-sm text-text-primary font-medium">{idx === 0 ? `#${sale.number}` : ''}</td>
                      <td className="px-4 py-3 text-sm text-text-primary">{item.name}</td>
                      <td className="px-4 py-3 text-sm text-text-primary">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{item.brandName}</td>
                      <td className="px-4 py-3 text-sm text-text-primary">{peso(item.unitPrice)}</td>
                      <td className="px-4 py-3 text-sm text-text-primary font-medium">{peso(item.subTotal)}</td>
                      <td className="px-4 py-3">
                        <span className="badge badge-neutral">
                          <span className={`badge-dot ${sale.paymentMethod === 'Cash' ? 'bg-accent-green' : 'bg-accent-blue'}`} />
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{sale.staff?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{idx === 0 ? formatDate(sale.createdAt) : ''}</td>
                      <td className="px-4 py-3">
                        {idx === 0 && (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => runSafe(async () => { await approveSale.mutateAsync(sale.id); setActionStatus(`✓ Sale #${sale.number} approved.`); })} className="p-1.5 bg-accent-green text-white rounded hover:opacity-90 transition" title="Approve"><CheckCircle size={15} /></button>
                            <button onClick={() => runSafe(async () => { await declineSale.mutateAsync(sale.id); setActionStatus(`Sale #${sale.number} declined.`); })} className="p-1.5 bg-accent-orange text-white rounded hover:opacity-90 transition" title="Decline"><XCircle size={15} /></button>
                            <button onClick={() => { setActionError(null); setEditingSale(sale); }} className="p-1.5 text-accent-blue hover:bg-blue-500/10 rounded transition" title="Edit"><Pencil size={15} /></button>
                            <button onClick={() => { setActionError(null); setDeletingSale(sale); }} className="p-1.5 text-accent-red hover:bg-red-500/10 rounded transition" title="Delete"><Trash2 size={15} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-accent-orange/10 border-b border-card-border">
                    <td colSpan={10} className="px-4 py-2 text-sm font-semibold text-accent-orange">
                      Total for Sale #{sale.number}{sale.branch ? ` (${sale.branch.name})` : ''}: {peso(sale.total)}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="p-4 border-t border-card-border">
          <div className="border-l-4 border-accent-blue pl-4 space-y-1">
            <p className="text-sm text-text-primary"><span className="font-medium">Total for Cash:</span> {peso(summary.cash)}</p>
            <p className="text-sm text-text-primary"><span className="font-medium">Total for Gcash:</span> {peso(summary.gcash)}</p>
            <p className="text-sm text-text-primary font-bold">Total for All Pending: {peso(summary.total)}</p>
          </div>
        </div>
      </div>

      {/* Staff Drafts (in-progress carts, not yet submitted) */}
      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm mt-6">
        <div className="p-4 border-b border-card-border flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
            <ShoppingBag size={18} /> Staff Drafts
            {drafts.length > 0 && <span className="badge badge-neutral">{drafts.length}</span>}
          </h2>
          <p className="text-xs text-text-muted">Live view of carts staff are currently building — not yet submitted for approval.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Staff</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Shop</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Items</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {draftsLoading ? (
                <tr><td colSpan={6} className="text-center py-6 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading…</td></tr>
              ) : drafts.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-6 text-text-muted">No staff currently building an order.</td></tr>
              ) : drafts.map((d) => (
                <tr key={d.id} className="border-b border-card-border hover:bg-white/5 transition align-top">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-text-primary">{d.staff.name}</p>
                    <p className="text-xs text-text-muted">{d.staff.email}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.branch?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    <ul className="space-y-0.5">
                      {d.items.map((item) => (
                        <li key={item.productId}>{item.quantity}× {item.name}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge badge-neutral">
                      <span className={`badge-dot ${d.paymentMethod === 'Cash' ? 'bg-accent-green' : 'bg-accent-blue'}`} />
                      {d.paymentMethod}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary font-medium">{peso(d.total)}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(d.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Disposals */}
      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm mt-6">
        <div className="p-4 border-b border-card-border flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
            <Recycle size={18} /> Pending Disposals
            {disposals.length > 0 && <span className="badge badge-neutral">{disposals.length}</span>}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { const n = disposals.length; if (!n) return; runSafe(async () => { await Promise.all(disposals.map((d) => approveDisposal.mutateAsync(d.id))); setActionStatus(`✓ All ${n} disposal${n === 1 ? '' : 's'} approved (stock deducted).`); }); }}
              disabled={disposals.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-green text-white rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-70"
            >
              <CheckCircle size={15} /> Approve All
            </button>
            <button
              onClick={() => { const n = disposals.length; if (!n) return; runSafe(async () => { await Promise.all(disposals.map((d) => declineDisposal.mutateAsync(d.id))); setActionStatus(`All ${n} disposal${n === 1 ? '' : 's'} declined.`); }); }}
              disabled={disposals.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-red text-white rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-70"
            >
              <XCircle size={15} /> Decline All
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Shop</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Qty</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Value</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Requested By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {dispLoading ? (
                <tr><td colSpan={9} className="text-center py-6 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading…</td></tr>
              ) : disposals.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-6 text-text-muted">No pending disposals.</td></tr>
              ) : disposals.map((d) => (
                <tr key={d.id} className="border-b border-card-border hover:bg-white/5 transition">
                  <td className="px-4 py-3 text-sm text-text-primary">{d.name}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.brandName}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.branch?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-text-primary">{d.quantity}</td>
                  <td className="px-4 py-3 text-sm text-text-primary font-medium">{peso(d.value)}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary max-w-[180px] truncate">{d.reason ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.createdBy}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(d.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => runSafe(async () => { await approveDisposal.mutateAsync(d.id); setActionStatus(`✓ Disposal of ${d.quantity}× ${d.name} approved (stock deducted).`); })} className="p-1.5 bg-accent-green text-white rounded hover:opacity-90 transition" title="Approve"><CheckCircle size={15} /></button>
                      <button onClick={() => runSafe(async () => { await declineDisposal.mutateAsync(d.id); setActionStatus(`Disposal of ${d.name} declined.`); })} className="p-1.5 bg-accent-orange text-white rounded hover:opacity-90 transition" title="Decline"><XCircle size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingSale && (
        <EditSaleModal
          sale={editingSale}
          products={products}
          isSaving={updateSale.isPending}
          onClose={() => setEditingSale(null)}
          onSave={async (payload) => {
            setActionError(null);
            try {
              await updateSale.mutateAsync({ id: editingSale.id, ...payload });
              setEditingSale(null);
            } catch (e) {
              throw new Error(getApiErrorMessage(e));
            }
          }}
        />
      )}

      {deletingSale && (
        <Modal title="Delete Pending Sale" onClose={() => setDeletingSale(null)}>
          <p className="text-sm text-text-secondary mb-4">
            Delete pending sale <strong>#{deletingSale.number}</strong>? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeletingSale(null)} className="px-4 py-2 border border-input-border rounded-lg text-sm text-text-primary hover:bg-white/5 transition">Cancel</button>
            <button
              onClick={() => runSafe(async () => { await deleteSale.mutateAsync(deletingSale.id); setDeletingSale(null); })}
              disabled={deleteSale.isPending}
              className="px-4 py-2 bg-accent-red text-white rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-60"
            >
              {deleteSale.isPending ? 'Deleting...' : 'Yes, Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EditSaleModal({
  sale,
  products,
  isSaving,
  onClose,
  onSave,
}: {
  sale: Sale;
  products: { id: string; name: string; sellingPrice: number; brand: { name: string } | null }[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: { paymentMethod: 'Cash' | 'Gcash'; customerName?: string; items: EditRow[] }) => Promise<void>;
}) {
  const [rows, setRows] = useState<EditRow[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Gcash'>(sale.paymentMethod);
  const [customerName, setCustomerName] = useState(sale.customerName ?? '');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Seed rows from the sale's current items (skip items whose product was deleted).
    setRows(
      sale.items
        .filter((i) => i.productId)
        .map((i) => ({ productId: i.productId as string, quantity: i.quantity })),
    );
  }, [sale]);

  const priceOf = (productId: string) => products.find((p) => p.id === productId)?.sellingPrice ?? 0;
  const computedTotal = rows.reduce((sum, r) => sum + priceOf(r.productId) * r.quantity, 0);

  const setRow = (idx: number, patch: Partial<EditRow>) => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addRow = () => {
    const first = products[0];
    if (!first) return;
    setRows((rs) => [...rs, { productId: first.id, quantity: 1 }]);
  };
  const removeRow = (idx: number) => setRows((rs) => rs.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (rows.length === 0) { setErr('A sale must have at least one item.'); return; }
    if (rows.some((r) => r.quantity < 1)) { setErr('All quantities must be at least 1.'); return; }
    setErr(null);
    try {
      await onSave({
        paymentMethod,
        customerName: customerName.trim() || undefined,
        items: rows.map((r) => ({ productId: r.productId, quantity: r.quantity })),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save sale.');
    }
  };

  return (
    <Modal title={`Edit Sale #${sale.number}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Payment Method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'Cash' | 'Gcash')} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus">
              <option value="Cash">Cash</option>
              <option value="Gcash">Gcash</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Customer (optional)</label>
            <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-text-primary">Items</label>
            <button onClick={addRow} className="flex items-center gap-1 text-sm text-accent-blue hover:underline"><Plus size={14} /> Add item</button>
          </div>
          <div className="space-y-2">
            {rows.length === 0 && <p className="text-xs text-text-muted">No items. Add at least one.</p>}
            {rows.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select value={row.productId} onChange={(e) => setRow(idx, { productId: e.target.value })} className="flex-1 border border-input-border rounded px-2 py-1.5 text-sm bg-input-bg focus:outline-none focus:border-input-focus">
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.brand ? ` (${p.brand.name})` : ''} — {peso(p.sellingPrice)}</option>
                  ))}
                </select>
                <input type="number" min="1" value={row.quantity} onChange={(e) => setRow(idx, { quantity: parseInt(e.target.value) || 1 })} className="w-20 border border-input-border rounded px-2 py-1.5 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
                <span className="w-24 text-right text-sm text-text-secondary">{peso(priceOf(row.productId) * row.quantity)}</span>
                <button onClick={() => removeRow(idx)} className="p-1.5 text-accent-red hover:bg-red-500/10 rounded transition" title="Remove"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-card-border pt-3">
          <span className="text-sm font-semibold text-text-primary">New total: {peso(computedTotal)}</span>
        </div>

        {err && <p className="text-sm text-accent-red">{err}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-input-border rounded-lg text-sm text-text-primary hover:bg-white/5 transition">Cancel</button>
          <button onClick={handleSubmit} disabled={isSaving} className="btn-grad px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
