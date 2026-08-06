'use client';

import { useState } from 'react';
import { Search, Trash2, Plus, X, Loader2 } from 'lucide-react';
import { useDisposals, useCreateDisposal, useBranches, useProducts } from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function DisposalsPage() {
  const [search, setSearch] = useState('');
  const [selectedShop, setSelectedShop] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showModal, setShowModal] = useState(false);

  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];

  const { data, isLoading, isError, error } = useDisposals({
    search, branchId: selectedShop || undefined, startDate: startDate || undefined, endDate: endDate || undefined,
  });
  // Show only approved disposals (the stock actually written off).
  const disposals = (data?.data ?? []).filter((d) => d.status === 'APPROVED');
  const summary = {
    totalQuantity: disposals.reduce((s, d) => s + d.quantity, 0),
    totalValue: disposals.reduce((s, d) => s + d.value, 0),
    count: disposals.length,
  };

  return (
    <div className="p-6 bg-page-bg min-h-screen">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-text-primary">Disposals</h1>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 btn-grad px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={16} /> Request Disposal
        </button>
      </div>
      <p className="text-sm text-text-muted mb-6">Approved disposals (stock that has been written off). New requests go to <strong>Sales → Pending</strong> for approval.</p>

      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm mb-4">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <select value={selectedShop} onChange={(e) => setSelectedShop(e.target.value)} className="px-3 py-2 border border-input-border rounded-lg text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus">
            <option value="">All Shops</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 border border-input-border rounded-lg text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 border border-input-border rounded-lg text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus" />
        </div>
      </div>

      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm">
        <div className="p-4 border-b border-card-border">
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" placeholder="Search disposals..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-input-border rounded-lg bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Shop</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Qty</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Value</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading...</td></tr>
              ) : isError ? (
                <tr><td colSpan={10} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
              ) : disposals.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-text-muted">No approved disposals yet.</td></tr>
              ) : disposals.map((d, idx) => (
                <tr key={d.id} className="border-b border-card-border transition">
                  <td className="px-4 py-3 text-sm text-text-primary">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm text-text-primary">{d.name}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.brandName}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.branch?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-text-primary">{d.quantity}</td>
                  <td className="px-4 py-3 text-sm text-text-primary font-medium">{peso(d.value)}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary max-w-[200px] truncate">{d.reason ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="badge badge-neutral">
                      <span className={`badge-dot ${d.status === 'APPROVED' ? 'bg-accent-green' : d.status === 'DECLINED' ? 'bg-accent-red' : 'bg-accent-orange'}`} />
                      {d.status.charAt(0) + d.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.createdBy}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-card-border">
          <div className="border-l-4 border-accent-red pl-4 space-y-1">
            <p className="text-sm text-text-primary"><span className="font-medium">Items disposed:</span> {summary.totalQuantity}</p>
            <p className="text-sm text-text-primary font-bold">Total value written off: {peso(summary.totalValue)}</p>
          </div>
        </div>
      </div>

      {showModal && <RecordDisposalModal branches={branches} onClose={() => setShowModal(false)} />}
    </div>
  );
}

function RecordDisposalModal({ branches, onClose }: { branches: { id: string; name: string }[]; onClose: () => void }) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const { data: productData } = useProducts({ branchId: branchId || undefined });
  const products = productData?.data ?? [];
  const createDisposal = useCreateDisposal();

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selected = products.find((p) => p.id === productId);
  const available = selected?.quantities.find((q) => q.branchId === branchId)?.quantity ?? 0;

  async function submit() {
    if (!branchId) { setError('Select a shop.'); return; }
    if (!productId) { setError('Select a product.'); return; }
    const qty = Number(quantity);
    if (!qty || qty < 1) { setError('Enter a quantity of at least 1.'); return; }
    setError(null);
    try {
      await createDisposal.mutateAsync({ branchId, productId, quantity: qty, reason: reason.trim() || undefined });
      onClose();
    } catch (e) { setError(getApiErrorMessage(e)); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card-bg border border-card-border rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text-primary">Request Disposal</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <p className="text-xs text-text-muted">Request to write off damaged/expired/unsellable stock. It goes to <strong>Pending Sales</strong> for an admin to approve. Stock is only deducted once approved.</p>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Shop</label>
            <select value={branchId} onChange={(e) => { setBranchId(e.target.value); setProductId(''); }} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg">
              <option value="">Select shop</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Product</label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg">
              <option value="">Select product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {selected && <p className="text-xs text-text-muted mt-1">In stock at this shop: <strong>{available}</strong></p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Quantity to dispose</label>
            <input type="number" min="1" max={available} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Reason (optional)</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Expired, Damaged" className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg" />
          </div>
          {error && <p className="text-sm text-accent-red">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-secondary text-text-primary px-4 py-2 rounded text-sm font-medium">Cancel</button>
            <button onClick={submit} disabled={createDisposal.isPending} className="bg-btn-danger text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-60">{createDisposal.isPending ? 'Submitting...' : 'Submit Request'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
