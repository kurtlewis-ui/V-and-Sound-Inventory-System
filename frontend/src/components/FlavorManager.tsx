'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import { useCreateVariant, useUpdateVariant, useDeleteVariant } from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { getApiErrorMessage } from '@/lib/api';
import type { ProductVariant } from '@/lib/types';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Flavor/variant manager shown inside the product detail or product table.
 * Allows Admin/Owner to add, edit, and remove flavors for a product.
 */
export function FlavorManager({ productId, variants, onClose }: {
  productId: string;
  variants: ProductVariant[];
  onClose?: () => void;
}) {
  const isOwner = useAuthStore((s) => s.user?.role?.name === 'Owner');
  const createVariant = useCreateVariant();
  const updateVariant = useUpdateVariant();
  const deleteVariant = useDeleteVariant();

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName(''); setPrice(''); setCostPrice(''); setError(null);
    setShowAdd(false); setEditingId(null);
  }

  function openEdit(v: ProductVariant) {
    setEditingId(v.id);
    setName(v.name);
    setPrice(v.sellingPrice.toString());
    setCostPrice(v.costPrice?.toString() ?? '');
    setShowAdd(false);
    setError(null);
  }

  async function handleAdd() {
    if (!name.trim()) { setError('Flavor name is required'); return; }
    if (!price || Number(price) < 0) { setError('Valid price is required'); return; }
    setError(null);
    try {
      await createVariant.mutateAsync({
        productId,
        name: name.trim(),
        sellingPrice: parseFloat(price) || 0,
        costPrice: parseFloat(costPrice) || 0,
      });
      resetForm();
    } catch (e) { setError(getApiErrorMessage(e)); }
  }

  async function handleUpdate() {
    if (!editingId || !name.trim()) { setError('Flavor name is required'); return; }
    setError(null);
    try {
      await updateVariant.mutateAsync({
        variantId: editingId,
        name: name.trim(),
        sellingPrice: parseFloat(price) || 0,
        costPrice: parseFloat(costPrice) || 0,
      });
      resetForm();
    } catch (e) { setError(getApiErrorMessage(e)); }
  }

  async function handleDelete(variantId: string) {
    if (!confirm('Archive this flavor? It will be hidden from sales.')) return;
    try {
      await deleteVariant.mutateAsync(variantId);
    } catch (e) { setError(getApiErrorMessage(e)); }
  }

  return (
    <div className="mt-3 border border-card-border rounded-lg p-3 bg-white/5">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-text-primary">Flavors / Variants</h4>
        <div className="flex items-center gap-2">
          {!showAdd && !editingId && (
            <button onClick={() => { setShowAdd(true); resetForm(); setShowAdd(true); }} className="flex items-center gap-1 text-xs text-accent-blue hover:underline">
              <Plus size={12} /> Add Flavor
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="text-text-muted hover:text-text-primary">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Existing flavors list */}
      {variants.length === 0 && !showAdd && (
        <p className="text-xs text-text-muted py-2">No flavors added yet. This product sells as a single item.</p>
      )}
      {variants.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {variants.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded bg-white/5 px-2.5 py-1.5 text-sm">
              <div className="flex items-center gap-3">
                <span className="font-medium text-text-primary">{v.name}</span>
                <span className="text-text-secondary">{peso(v.sellingPrice)}</span>
                {isOwner && v.costPrice !== undefined && (
                  <span className="text-text-muted text-xs">(cost: {peso(v.costPrice)})</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => openEdit(v)} className="p-1 text-text-muted hover:text-accent-blue" title="Edit">
                  <Pencil size={12} />
                </button>
                <button onClick={() => handleDelete(v.id)} className="p-1 text-text-muted hover:text-accent-red" title="Archive">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit form */}
      {(showAdd || editingId) && (
        <div className="border-t border-card-border pt-2 mt-2 space-y-2">
          <p className="text-xs font-medium text-text-secondary">{editingId ? 'Edit Flavor' : 'Add New Flavor'}</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Flavor name (e.g. Watermelon)"
              className="col-span-2 border border-input-border rounded px-2 py-1.5 text-sm bg-input-bg focus:outline-none focus:border-input-focus"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Selling Price (₱)"
              className="border border-input-border rounded px-2 py-1.5 text-sm bg-input-bg focus:outline-none focus:border-input-focus"
            />
            {isOwner && (
              <input
                type="number"
                step="0.01"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="Cost Price (₱)"
                className="border border-input-border rounded px-2 py-1.5 text-sm bg-input-bg focus:outline-none focus:border-input-focus"
              />
            )}
          </div>
          {error && <p className="text-xs text-accent-red">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={editingId ? handleUpdate : handleAdd}
              disabled={createVariant.isPending || updateVariant.isPending}
              className="flex items-center gap-1 bg-btn-primary text-btn-primary-text px-3 py-1.5 rounded text-xs font-medium hover:opacity-90 disabled:opacity-60"
            >
              {(createVariant.isPending || updateVariant.isPending) && <Loader2 size={12} className="animate-spin" />}
              {editingId ? 'Update' : 'Add'}
            </button>
            <button onClick={resetForm} className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
