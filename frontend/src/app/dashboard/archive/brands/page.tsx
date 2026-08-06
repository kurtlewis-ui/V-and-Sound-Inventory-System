'use client';

import { useState } from 'react';
import { Search, Undo2, Loader2 } from 'lucide-react';
import { useArchivedBrands, useRestoreBrand } from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';

export default function BrandsArchivePage() {
  const { data, isLoading, isError, error } = useArchivedBrands();
  const restore = useRestoreBrand();
  const brands = data?.data ?? [];
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = brands.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));

  const handleRestore = async (id: string) => {
    setActionError(null);
    try { await restore.mutateAsync(id); } catch (e) { setActionError(getApiErrorMessage(e)); }
  };

  return (
    <div className="p-6 bg-page-bg min-h-screen">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Brands Archive</h1>
      {actionError && <div className="mb-4 rounded-lg bg-accent-red/10 border border-accent-red/30 px-4 py-2 text-sm text-accent-red">{actionError}</div>}

      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm">
        <div className="p-4 border-b border-card-border">
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" placeholder="Search archived brands..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-input-border rounded-lg bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Slug</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading...</td></tr>
              ) : isError ? (
                <tr><td colSpan={4} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-12"><div className="border-l-4 border-accent-orange pl-4"><p className="text-accent-orange font-medium">No archived brands found.</p></div></td></tr>
              ) : filtered.map((brand, idx) => (
                <tr key={brand.id} className="border-b border-card-border transition">
                  <td className="px-4 py-3 text-sm text-text-primary">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm text-text-primary font-medium">{brand.name}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary font-mono">{brand.slug}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleRestore(brand.id)} disabled={restore.isPending} className="inline-flex items-center gap-1 rounded-lg bg-accent-green/10 px-2.5 py-1 text-sm font-medium text-accent-green hover:bg-accent-green/20 transition-colors disabled:opacity-50" title="Restore">
                      <Undo2 size={14} /> Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
