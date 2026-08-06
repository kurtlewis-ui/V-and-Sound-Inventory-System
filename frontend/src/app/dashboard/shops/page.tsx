'use client';

import { useState } from 'react';
import { Plus, Search, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import {
  useBranches,
  useCreateBranch,
  useUpdateBranch,
  useArchiveBranch,
} from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';
import type { Branch } from '@/lib/types';

export default function ShopsPage() {
  const { data, isLoading, isError, error } = useBranches();
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const archiveBranch = useArchiveBranch();

  const shops = data?.data ?? [];

  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [editingShop, setEditingShop] = useState<Branch | null>(null);
  const [archivingShop, setArchivingShop] = useState<Branch | null>(null);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const filteredShops = shops.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleAdd() {
    if (!newName.trim()) {
      setFormError('Shop name is required.');
      return;
    }
    setFormError(null);
    try {
      await createBranch.mutateAsync({ name: newName.trim(), address: newAddress.trim() || undefined });
      setNewName('');
      setNewAddress('');
      setShowAddModal(false);
    } catch (e) {
      setFormError(getApiErrorMessage(e));
    }
  }

  async function handleEdit() {
    if (!editingShop || !newName.trim()) {
      setFormError('Shop name is required.');
      return;
    }
    setFormError(null);
    try {
      await updateBranch.mutateAsync({ id: editingShop.id, name: newName.trim(), address: newAddress.trim() || undefined });
      setNewName('');
      setNewAddress('');
      setEditingShop(null);
      setShowEditModal(false);
    } catch (e) {
      setFormError(getApiErrorMessage(e));
    }
  }

  async function handleArchive() {
    if (!archivingShop) return;
    try {
      await archiveBranch.mutateAsync(archivingShop.id);
      setArchivingShop(null);
      setShowArchiveModal(false);
    } catch (e) {
      setFormError(getApiErrorMessage(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Shops</h1>
        <button
          onClick={() => { setNewName(''); setNewAddress(''); setFormError(null); setShowAddModal(true); }}
          className="flex items-center gap-2 btn-grad px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} />
          Add new Shop
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-input-border rounded-lg pl-9 pr-4 py-2 text-sm text-text-primary bg-input-bg focus:outline-none focus:border-input-focus"
        />
      </div>

      <div className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-table-header">
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-table-header-text w-16">#</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-table-header-text">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-table-header-text">Address</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-table-header-text">Staff</th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-table-header-text w-24"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading shops...</td></tr>
            ) : isError ? (
              <tr><td colSpan={5} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
            ) : filteredShops.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-text-muted">No shops found.</td></tr>
            ) : (
              filteredShops.map((shop, i) => (
                <tr key={shop.id} className="border-t border-card-border transition-colors">
                  <td className="px-4 py-3 text-sm text-accent-blue font-medium">{i + 1}</td>
                  <td className="px-4 py-3 text-sm text-accent-blue font-medium">{shop.name}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{shop.address || '—'}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{shop.staffCount}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setEditingShop(shop); setNewName(shop.name); setNewAddress(shop.address ?? ''); setFormError(null); setShowEditModal(true); }}
                        className="icon-btn text-accent-blue hover:bg-accent-blue/10"
                        title="Edit"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => { setArchivingShop(shop); setFormError(null); setShowArchiveModal(true); }}
                        className="icon-btn text-accent-red hover:bg-accent-red/10"
                        title="Archive"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <Modal title="Add New Shop" onClose={() => setShowAddModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full border border-input-border rounded px-3 py-2 text-sm text-text-primary bg-input-bg focus:outline-none focus:border-input-focus"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Address (optional)</label>
              <input
                type="text"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="e.g. 123 Main St, City"
                className="w-full border border-input-border rounded px-3 py-2 text-sm text-text-primary bg-input-bg focus:outline-none focus:border-input-focus"
              />
            </div>
            {formError && <p className="text-sm text-accent-red">{formError}</p>}
            <div className="flex justify-end">
              <button onClick={handleAdd} disabled={createBranch.isPending} className="btn-grad px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
                {createBranch.isPending ? 'Saving...' : 'Save Shop'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showEditModal && editingShop && (
        <Modal title="Edit Shop" onClose={() => { setShowEditModal(false); setEditingShop(null); }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full border border-input-border rounded px-3 py-2 text-sm text-text-primary bg-input-bg focus:outline-none focus:border-input-focus"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Address (optional)</label>
              <input
                type="text"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="e.g. 123 Main St, City"
                className="w-full border border-input-border rounded px-3 py-2 text-sm text-text-primary bg-input-bg focus:outline-none focus:border-input-focus"
              />
            </div>
            {formError && <p className="text-sm text-accent-red">{formError}</p>}
            <div className="flex justify-end">
              <button onClick={handleEdit} disabled={updateBranch.isPending} className="btn-grad px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
                {updateBranch.isPending ? 'Saving...' : 'Save Shop'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showArchiveModal && archivingShop && (
        <Modal title="Confirm Archive" onClose={() => { setShowArchiveModal(false); setArchivingShop(null); }}>
          <div className="space-y-4">
            <p className="text-sm text-text-primary">
              Are you sure you want to archive <strong>{archivingShop.name}</strong>?
            </p>
            {formError && <p className="text-sm text-accent-red">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowArchiveModal(false); setArchivingShop(null); }} className="btn-secondary text-text-primary px-4 py-2 rounded text-sm font-medium">
                Cancel
              </button>
              <button onClick={handleArchive} disabled={archiveBranch.isPending} className="bg-btn-danger text-white px-4 py-2 rounded text-sm font-medium hover:opacity-90 transition disabled:opacity-60">
                {archiveBranch.isPending ? 'Archiving...' : 'Yes, Archive'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card-bg border border-card-border rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text-primary">{title}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
