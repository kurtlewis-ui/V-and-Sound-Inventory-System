'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Search, X, CheckCircle2 } from 'lucide-react';
import { useBrands, useProducts } from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { useDraftStore } from '@/lib/draft';
import { getApiErrorMessage } from '@/lib/api';
import { GridSkeleton } from '@/components/Skeleton';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type StaffProduct = {
  id: string;
  name: string;
  image: string | null;
  sellingPrice: number;
  totalQuantity: number;
  brand: { id: string; name: string } | null;
};

export default function BrandProductsPage() {
  const router = useRouter();
  const params = useParams();
  const brandId = String(params.brandId);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<StaffProduct | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const user = useAuthStore((s) => s.user);
  const branchId = user?.branch?.id;
  const branchName = user?.branch?.name;

  const { data: brandData } = useBrands();
  const brand = (brandData?.data ?? []).find((b) => b.id === brandId);

  const { data, isLoading, isError, error } = useProducts({ brandId, branchId, search });
  const products = (data?.data ?? []) as StaffProduct[];

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2500);
  }

  return (
    <div>
      <button
        onClick={() => router.push('/staff')}
        className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-text-primary hover:bg-white/15 transition"
      >
        <ArrowLeft size={15} /> Back
      </button>

      {branchName && (
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1">{branchName}</p>
      )}
      <h1 className="text-2xl font-bold text-text-primary mb-4">{brand?.name ?? 'Products'}</h1>

      <div className="mb-6 flex max-w-2xl items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input-border bg-input-bg py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
          />
        </div>
      </div>

      {!branchId ? (
        <div className="py-16 text-center text-accent-orange">
          Your account is not assigned to a shop. Ask an admin to assign one.
        </div>
      ) : isLoading ? (
        <GridSkeleton count={10} />
      ) : isError ? (
        <div className="py-16 text-center text-accent-red">{getApiErrorMessage(error)}</div>
      ) : products.length === 0 ? (
        <div className="py-16 text-center text-text-muted">No products found for this brand.</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {products.map((p) => {
            const isOutOfStock = p.totalQuantity <= 0;
            const isLowStock = !isOutOfStock && p.totalQuantity <= 5;
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className={`relative flex flex-col overflow-hidden rounded-xl border bg-card-bg text-left shadow-sm transition hover:shadow-md hover:shadow-accent-primary/10 ${
                  isOutOfStock
                    ? 'border-accent-red/40 opacity-60 grayscale-[40%]'
                    : isLowStock
                    ? 'border-accent-orange/40 hover:border-accent-primary/50'
                    : 'border-card-border hover:border-accent-primary/50'
                }`}
              >
                {isOutOfStock && (
                  <div className="absolute top-2 right-2 z-10 rounded bg-accent-red px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                    OUT
                  </div>
                )}
                {isLowStock && (
                  <div className="absolute top-2 right-2 z-10 rounded bg-accent-orange px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                    LOW
                  </div>
                )}
                <div className="flex aspect-square items-center justify-center bg-white/5">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-text-muted">No Image Available</span>
                  )}
                </div>
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-semibold text-text-primary" title={p.name}>{p.name}</p>
                  <p className="text-sm font-bold text-accent-purple-light">{peso(p.sellingPrice)}</p>
                  <p className={`text-xs ${isOutOfStock ? 'text-accent-red font-medium' : isLowStock ? 'text-accent-orange font-medium' : 'text-text-muted'}`}>
                    Stock/s: {p.totalQuantity}
                    {isOutOfStock && ' (Out of stock)'}
                    {isLowStock && ' (Low stock)'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <AddPurchaseModal
          product={selected}
          onClose={() => setSelected(null)}
          onSaved={(msg) => { setSelected(null); showToast(msg); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-accent-green/90 px-4 py-2 text-sm font-medium text-white shadow-lg flex items-center gap-2">
          <CheckCircle2 size={16} /> {toast}
        </div>
      )}
    </div>
  );
}

type ItemPaymentMethod = 'Cash' | 'Gcash' | 'BankTransfer' | 'Cashless' | 'Split';

function AddPurchaseModal({
  product,
  onClose,
  onSaved,
}: {
  product: StaffProduct;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [quantity, setQuantity] = useState('1');
  const [discount, setDiscount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<ItemPaymentMethod>('Cash');
  const [bankNote, setBankNote] = useState('');
  const [note, setNote] = useState('');
  const [splitCash, setSplitCash] = useState('');
  const [splitGcash, setSplitGcash] = useState('');
  const [splitBankTransfer, setSplitBankTransfer] = useState('');
  const [disposalReason, setDisposalReason] = useState('');
  const [disposalNote, setDisposalNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const addItem = useDraftStore((s) => s.addItem);
  const addDisposalItem = useDraftStore((s) => s.addDisposalItem);
  const draftItems = useDraftStore((s) => s.items);
  const draftDisposalItems = useDraftStore((s) => s.disposalItems);

  // Units already staged in the draft — whether to sell or to dispose —
  // don't come off the server's stock count until the draft is actually
  // submitted, so both must be subtracted here or staff could stage more
  // than actually exists.
  const alreadyInCart =
    (draftItems.find((i) => i.productId === product.id)?.quantity ?? 0) +
    (draftDisposalItems.find((i) => i.productId === product.id)?.quantity ?? 0);
  const stock = product.totalQuantity;
  const available = Math.max(0, stock - alreadyInCart);

  const qtyNumber = Number(quantity) || 0;
  const lineTotal = product.sellingPrice * qtyNumber;
  const discountNumber = Number(discount) || 0;
  const discountTooHigh = discountNumber > lineTotal + 0.001;
  const discountedTotal = Math.max(0, lineTotal - discountNumber);
  const allocated = (Number(splitCash) || 0) + (Number(splitGcash) || 0) + (Number(splitBankTransfer) || 0);
  const splitCashless = Math.max(0, discountedTotal - allocated);
  const splitOverAllocated = allocated > discountedTotal + 0.001;

  function validQty(): number | null {
    const qty = Number(quantity);
    if (!qty || qty < 1) { setError('Enter a quantity of at least 1.'); return null; }
    if (qty > available) {
      setError(
        alreadyInCart > 0
          ? `Only ${available} more available (${alreadyInCart} already in your draft order).`
          : `Only ${available} in stock at your shop.`,
      );
      return null;
    }
    return qty;
  }

  function handleSaveRecords() {
    setError(null);
    const qty = validQty();
    if (qty === null) return;
    if (discountTooHigh) {
      setError('Discount can\'t be more than this item\'s total.');
      return;
    }
    if (paymentMethod === 'Split' && splitOverAllocated) {
      setError('Split amounts add up to more than the item total.');
      return;
    }
    addItem(
      {
        productId: product.id,
        name: product.name,
        brandName: product.brand?.name ?? '',
        unitPrice: product.sellingPrice,
        image: product.image,
        discount: discountNumber,
        paymentMethod,
        bankNote: paymentMethod === 'BankTransfer' || paymentMethod === 'Split' ? bankNote.trim() || null : null,
        note: note.trim() || null,
        paymentSplit:
          paymentMethod === 'Split'
            ? {
                cash: Number(splitCash) || 0,
                gcash: Number(splitGcash) || 0,
                bankTransfer: Number(splitBankTransfer) || 0,
                cashless: splitCashless,
              }
            : null,
      },
      qty,
    );
    onSaved(`Added ${qty}× ${product.name} to your draft order.`);
  }

  function handleDispose() {
    setError(null);
    const qty = validQty();
    if (qty === null) return;
    // Combine dropdown reason and note into one string.
    const reasonParts: string[] = [];
    if (disposalReason.trim()) reasonParts.push(disposalReason.trim());
    if (disposalNote.trim()) reasonParts.push(disposalNote.trim());
    const combinedReason = reasonParts.join(' — ') || null;
    addDisposalItem(
      {
        productId: product.id,
        name: product.name,
        brandName: product.brand?.name ?? '',
        image: product.image,
        reason: combinedReason,
      },
      qty,
    );
    onSaved(`Added ${qty}× ${product.name} to your draft order's Dispose list.`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm mx-4 rounded-lg border border-card-border bg-card-bg p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-text-primary">Add Purchase</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-white/10 flex items-center justify-center">
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-[9px] text-text-muted">No Img</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">{product.name}</p>
            <p className="text-sm font-bold text-accent-purple-light">{peso(product.sellingPrice)}</p>
            <p className={`text-xs ${available <= 0 ? 'text-accent-red' : 'text-text-muted'}`}>
              Stock/s: {stock}
              {alreadyInCart > 0 && ` (${alreadyInCart} in draft order, ${available} available)`}
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-text-primary mb-1">Quantity</label>
          <input
            type="number"
            min="1"
            max={available}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full rounded border border-input-border bg-input-bg px-3 py-2 text-sm focus:outline-none focus:border-input-focus"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-text-primary mb-1">Discount (₱, if selling)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder="0"
            className="w-full rounded border border-input-border bg-input-bg px-3 py-2 text-sm focus:outline-none focus:border-input-focus"
          />
          {discountNumber > 0 && (
            <p className={`mt-1 text-xs ${discountTooHigh ? 'text-accent-red' : 'text-text-secondary'}`}>
              {discountTooHigh ? "Discount exceeds this item's total." : `Total after discount: ${peso(discountedTotal)}`}
            </p>
          )}
        </div>

        <div className="mb-4 space-y-2 rounded-lg border border-card-border p-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">Payment (if selling)</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as ItemPaymentMethod)}
            className="w-full rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm"
          >
            <option value="Cash">Cash</option>
            <option value="Gcash">Gcash</option>
            <option value="BankTransfer">Bank Transfer</option>
            <option value="Cashless">Cashless (other)</option>
            <option value="Split">Split Payment</option>
          </select>

          {(paymentMethod === 'BankTransfer' || paymentMethod === 'Split') && (
            <input
              type="text"
              value={bankNote}
              onChange={(e) => setBankNote(e.target.value)}
              placeholder="Which bank? e.g. BDO, BPI"
              className="w-full rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm"
            />
          )}

          {paymentMethod === 'Split' && (
            <div className="space-y-1.5 rounded border border-card-border p-2">
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="block text-[11px] text-text-muted mb-0.5">Cash</label>
                  <input type="number" min="0" step="0.01" value={splitCash} onChange={(e) => setSplitCash(e.target.value)} placeholder="0" className="w-full rounded border border-input-border bg-input-bg px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-text-muted mb-0.5">Gcash</label>
                  <input type="number" min="0" step="0.01" value={splitGcash} onChange={(e) => setSplitGcash(e.target.value)} placeholder="0" className="w-full rounded border border-input-border bg-input-bg px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-text-muted mb-0.5">Bank Transfer</label>
                  <input type="number" min="0" step="0.01" value={splitBankTransfer} onChange={(e) => setSplitBankTransfer(e.target.value)} placeholder="0" className="w-full rounded border border-input-border bg-input-bg px-2 py-1 text-sm" />
                </div>
              </div>
              <p className={`text-xs ${splitOverAllocated ? 'text-accent-red' : 'text-text-secondary'}`}>
                Cashless (remainder): {peso(splitCashless)} {splitOverAllocated && '— exceeds item total'}
              </p>
            </div>
          )}

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note / reminder (optional)"
            className="w-full rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm"
          />
        </div>

        {error && <p className="mb-3 text-sm text-accent-red">{error}</p>}

        <div className="mb-4">
          <label className="block text-sm font-medium text-text-primary mb-1">Disposal Reason (if disposing)</label>
          <select
            value={disposalReason}
            onChange={(e) => setDisposalReason(e.target.value)}
            className="w-full rounded border border-input-border bg-input-bg px-3 py-2 text-sm focus:outline-none focus:border-input-focus"
          >
            <option value="">Select reason...</option>
            <option value="Leak">Leak</option>
            <option value="Damage">Damage</option>
            <option value="Crack">Crack</option>
            <option value="Expired">Expired</option>
            <option value="Burned">Burned</option>
            <option value="Not Working">Not Working</option>
          </select>
          <input
            type="text"
            value={disposalNote}
            onChange={(e) => setDisposalNote(e.target.value)}
            placeholder="Add note (optional)"
            className="mt-2 w-full rounded border border-input-border bg-input-bg px-3 py-2 text-sm focus:outline-none focus:border-input-focus"
          />
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            onClick={handleSaveRecords}
            disabled={available <= 0}
            className="rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-text hover:opacity-90 transition disabled:opacity-50"
          >
            Save Records
          </button>
          <button
            onClick={handleDispose}
            disabled={available <= 0}
            className="rounded-lg bg-accent-red px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition disabled:opacity-50"
          >
            Dispose
          </button>
        </div>
      </div>
    </div>
  );
}
