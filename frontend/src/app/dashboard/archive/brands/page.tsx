'use client';

import { useState } from 'react';
import { Search, Undo2, Trash2, Loader2 } from 'lucide-react';
import { useArchivedBrands, useRestoreBrand } from '@/lib/hooks';
import { getApiErrorMessage, api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useToast } from '@/components/Toast';

export default function BrandsArchivePage() {
  const { data, isLoading, isError, error, refetch } = useArchivedBrands();
  const restore = useRestoreBrand();
  const { showToast, showError } = useToast();
  const isOwner = useAuthStore((s) => s.user?.role?.name === 'Owner');
  const brands = data?.data ?? [];
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const filtered = brands.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));

  const handleRestore = async (id: string) => { setActionError(null); try { await restore.mutateAsync(id); showToast('Brand has been restored.', 'green'); } catch (e) { setActionError(getApiErrorMessage(e)); } };
  const startDelete = (id: string, name: string) => { setDeletingId(id); setDeletingName(name); setDeleteStep(1); setConfirmText(''); setActionError(null); };
  const cancelDelete = () => { setDeleteStep(0); setDeletingId(null); setConfirmText(''); };
  const handlePermanentDelete = async () => { if (!deletingId || confirmText !== deletingName) return; setDeleteLoading(true); try { await api.delete(`/brands/${deletingId}/permanent`); cancelDelete(); refetch(); showToast('Brand has been permanently deleted.', 'red'); } catch (e) { setActionError(getApiErrorMessage(e)); cancelDelete(); } finally { setDeleteLoading(false); } };

  return (
    <div className="p-6 bg-page-bg min-h-screen">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Brands Archive</h1>
      {actionError && <div className="mb-4 rounded-lg bg-accent-red/10 border border-accent-red/30 px-4 py-2 text-sm text-accent-red">{actionError}</div>}
      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm">
        <div className="p-4 border-b border-card-border"><div className="relative w-64"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input type="text" placeholder="Search archived brands..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-input-border rounded-lg bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" /></div></div>
        <div className="overflow-x-auto"><table className="w-full"><thead><tr className="bg-table-header text-table-header-text"><th className="px-4 py-3 text-left text-xs font-semibold uppercase">#</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase">Name</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase">Products</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase">Actions</th></tr></thead>
          <tbody>
            {isLoading ? (<tr><td colSpan={4} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading...</td></tr>) : isError ? (<tr><td colSpan={4} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>) : filtered.length === 0 ? (<tr><td colSpan={4} className="px-4 py-12"><div className="border-l-4 border-accent-orange pl-4"><p className="text-accent-orange font-medium">No archived brands found.</p></div></td></tr>) : filtered.map((brand, idx) => (
              <tr key={brand.id} className="border-b border-card-border transition">
                <td className="px-4 py-3 text-sm text-text-primary">{idx + 1}</td>
                <td className="px-4 py-3 text-sm text-text-primary font-medium">{brand.name}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{brand.productCount ?? 0}</td>
                <td className="px-4 py-3 flex items-center gap-2">
                  <button onClick={() => handleRestore(brand.id)} disabled={restore.isPending} className="inline-flex items-center gap-1 rounded-lg bg-accent-green/10 px-2.5 py-1 text-sm font-medium text-accent-green hover:bg-accent-green/20 transition-colors disabled:opacity-50" title="Restore"><Undo2 size={14} /> Restore</button>
                  {isOwner && <button onClick={() => startDelete(brand.id, brand.name)} className="inline-flex items-center gap-1 rounded-lg bg-accent-red/10 px-2.5 py-1 text-sm font-medium text-accent-red hover:bg-accent-red/20 transition-colors" title="Delete permanently"><Trash2 size={14} /></button>}
                </td>
              </tr>
            ))}
          </tbody></table></div>
      </div>
      {deleteStep === 1 && (<div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/60" onClick={cancelDelete} /><div className="relative bg-card-bg border border-card-border rounded-lg shadow-xl w-full max-w-sm mx-4 p-6 space-y-4"><h3 className="text-lg font-bold text-text-primary">Permanently Delete</h3><p className="text-sm text-text-secondary">This action cannot be undone. The brand <strong className="text-text-primary">&ldquo;{deletingName}&rdquo;</strong> and all its products will be permanently removed and cannot be recovered.</p><p className="text-sm text-text-secondary">Are you sure you want to proceed?</p><div className="flex justify-end gap-2 pt-2"><button onClick={cancelDelete} className="px-4 py-2 text-sm text-text-secondary border border-card-border rounded-lg hover:bg-white/5 transition">Cancel</button><button onClick={() => setDeleteStep(2)} className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition">Continue</button></div></div></div>)}
      {deleteStep === 2 && (<div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/60" onClick={cancelDelete} /><div className="relative bg-card-bg border border-card-border rounded-lg shadow-xl w-full max-w-sm mx-4 p-6 space-y-4"><h3 className="text-lg font-bold text-text-primary">Final Confirmation</h3><p className="text-sm text-text-secondary">Type the brand name to confirm:</p><input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={deletingName} className="w-full border border-input-border rounded-lg px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" autoFocus /><p className="text-xs text-text-muted">Type <strong className="text-text-primary">&ldquo;{deletingName}&rdquo;</strong> to permanently delete.</p><div className="flex justify-end gap-2 pt-2"><button onClick={cancelDelete} className="px-4 py-2 text-sm text-text-secondary border border-card-border rounded-lg hover:bg-white/5 transition">Cancel</button><button onClick={handlePermanentDelete} disabled={deleteLoading || confirmText !== deletingName} className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-40">{deleteLoading ? <Loader2 size={14} className="inline animate-spin" /> : 'Delete Forever'}</button></div></div></div>)}
    </div>
  );
}
