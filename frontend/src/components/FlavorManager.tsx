'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useCreateVariant, useUpdateVariant, useDeleteVariant } from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';

/**
 * Compact inline variant manager — shows variant list with ✏️🗑️ buttons
 * and a "+ Add" button. Used inside the Edit Product modal.
 */
export function FlavorManager({ productId, variants }: {
  productId: string;
  variants: { id: string; name: string }[];
}) {
  const createVariant = useCreateVariant();
  const updateVariant = useUpdateVariant();
  const deleteVariant = useDeleteVariant();

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName(''); setError(null);
    setShowAdd(false); setEditingId(null);
  }

  function openEdit(v: { id: string; name: string }) {
    setEditingId(v.id);
    setName(v.name);
    setShowAdd(false);
    setError(null);
  }

  async function handleAdd() {
    if (!name.trim()) { setError('Name is required'); return; }
    setError(null);
    try {
      await createVariant.mutateAsync({ productId, name: name.trim(), sellingPrice: 0 });
      resetForm();
    } catch (e) { setError(getApiErrorMessage(e)); }
  }

  async function handleUpdate() {
    if (!editingId || !name.trim()) { setError('Name is required'); return; }
    setError(null);
    try {
      await updateVariant.mutateAsync({ variantId: editingId, name: name.trim() });
      resetForm();
    } catch (e) { setError(getApiErrorMessage(e)); }
  }

  async function handleDelete(variantId: string) {
    if (!confirm('Archive this variant?')) return;
    try { await deleteVariant.mutateAsync(variantId); }
    catch (e) { setError(getApiErrorMessage(e)); }
  }

  return (
    <div className="space-y-2">
      {/* Variant list with edit/delete */}
      {variants.map((v) => (
        <div key={v.id} className="flex items-center justify-between rounded bg-white/5 px-2.5 py-1.5">
          {editingId === v.id ? (
            <div className="flex items-center gap-2 flex-1">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 border border-input-border rounded px-2 py-1 text-sm bg-input-bg focus:outline-none focus:border-input-focus" autoFocus />
              <button onClick={handleUpdate} disabled={updateVariant.isPending} className="text-xs text-accent-blue hover:underline">
                {updateVariant.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
              </button>
              <button onClick={resetForm} className="text-xs text-text-muted hover:text-text-primary">Cancel</button>
            </div>
          ) : (
            <>
              <span className="text-sm font-medium text-text-primary">{v.name}</span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => openEdit(v)} className="p-1 text-text-muted hover:text-accent-blue" title="Edit"><Pencil size={12} /></button>
                <button onClick={() => handleDelete(v.id)} className="p-1 text-text-muted hover:text-accent-red" title="Delete"><Trash2 size={12} /></button>
              </div>
            </>
          )}
        </div>
      ))}

      {/* Add new variant */}
      {showAdd ? (
        <div className="flex items-center gap-2">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="New name..." className="flex-1 border border-input-border rounded px-2 py-1 text-sm bg-input-bg focus:outline-none focus:border-input-focus" autoFocus />
          <button onClick={handleAdd} disabled={createVariant.isPending} className="text-xs text-accent-blue hover:underline">
            {createVariant.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
          </button>
          <button onClick={resetForm} className="text-xs text-text-muted hover:text-text-primary">Cancel</button>
        </div>
      ) : (
        <button onClick={() => { resetForm(); setShowAdd(true); }} className="flex items-center gap-1 text-xs text-accent-blue hover:underline">
          <Plus size={12} /> Add
        </button>
      )}

      {error && <p className="text-xs text-accent-red mt-1">{error}</p>}
    </div>
  );
}
