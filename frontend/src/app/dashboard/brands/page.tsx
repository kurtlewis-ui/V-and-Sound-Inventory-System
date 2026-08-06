'use client';

import { useEffect, useState } from 'react';
import { Plus, Search, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import {
  useBrands,
  useCreateBrand,
  useUpdateBrand,
  useArchiveBrand,
} from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';
import { fileToResizedDataUrl } from '@/lib/image';
import type { Brand } from '@/lib/types';

const PAGE_SIZES = [5, 10, 25, 50, 'All'] as const;
type PageSize = (typeof PAGE_SIZES)[number];

export default function BrandsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Debounce search by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isError, error } = useBrands(debouncedSearch);
  const createBrand = useCreateBrand();
  const updateBrand = useUpdateBrand();
  const archiveBrand = useArchiveBrand();

  const brands = data?.data ?? [];

  // Pagination
  const perPage = pageSize === 'All' ? brands.length || 1 : pageSize;
  const totalPages = Math.max(1, Math.ceil(brands.length / perPage));
  const page = Math.min(currentPage, totalPages);
  const displayBrands = pageSize === 'All' ? brands : brands.slice((page - 1) * perPage, page * perPage);
  const startIndex = brands.length === 0 ? 0 : (page - 1) * perPage + 1;
  const endIndex = Math.min(page * perPage, brands.length);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [archivingBrand, setArchivingBrand] = useState<Brand | null>(null);
  const [formName, setFormName] = useState('');
  const [formCoverImage, setFormCoverImage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleAdd() {
    if (!formName.trim()) { setFormError('Brand name is required.'); return; }
    setFormError(null);
    try {
      await createBrand.mutateAsync({ name: formName.trim(), coverImage: formCoverImage ?? undefined });
      setFormName('');
      setFormCoverImage(null);
      setShowAddModal(false);
    } catch (e) { setFormError(getApiErrorMessage(e)); }
  }

  async function handleEdit() {
    if (!editingBrand || !formName.trim()) { setFormError('Brand name is required.'); return; }
    setFormError(null);
    try {
      await updateBrand.mutateAsync({ id: editingBrand.id, name: formName.trim(), coverImage: formCoverImage ?? '' });
      setFormName('');
      setFormCoverImage(null);
      setEditingBrand(null);
      setShowEditModal(false);
    } catch (e) { setFormError(getApiErrorMessage(e)); }
  }

  async function handleArchive() {
    if (!archivingBrand) return;
    try {
      await archiveBrand.mutateAsync(archivingBrand.id);
      setArchivingBrand(null);
      setShowArchiveModal(false);
    } catch (e) { setFormError(getApiErrorMessage(e)); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Brands</h1>
        <button
          onClick={() => { setFormName(''); setFormCoverImage(null); setFormError(null); setShowAddModal(true); }}
          className="flex items-center gap-2 btn-grad px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} />
          Add new Brand
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          Show
          <select
            value={String(pageSize)}
            onChange={(e) => { const v = e.target.value; setPageSize(v === 'All' ? 'All' : (Number(v) as PageSize)); setCurrentPage(1); }}
            className="border border-input-border rounded px-2 py-1 text-sm bg-input-bg focus:outline-none"
          >
            {PAGE_SIZES.map((s) => <option key={String(s)} value={String(s)}>{s}</option>)}
          </select>
          entries
        </label>
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search brands..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="w-full border border-input-border rounded-lg pl-9 pr-4 py-2 text-sm text-text-primary bg-input-bg focus:outline-none focus:border-input-focus"
          />
        </div>
      </div>

      <div className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-table-header">
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-table-header-text w-12">#</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-table-header-text w-28">Cover Image</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-table-header-text">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-table-header-text">Products</th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-table-header-text w-24"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading brands...</td></tr>
            ) : isError ? (
              <tr><td colSpan={5} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
            ) : displayBrands.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-text-muted">No brands found.</td></tr>
            ) : (
              displayBrands.map((brand, i) => (
                <tr key={brand.id} className="border-t border-card-border transition-colors">
                  <td className="px-4 py-3 text-sm text-accent-blue font-medium">{startIndex + i}</td>
                  <td className="px-4 py-3 text-sm text-text-muted">
                    {brand.coverImage ? (
                      <div className="w-12 h-12 rounded bg-white/10 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={brand.coverImage} alt={brand.name} loading="lazy" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <span className="text-xs text-text-muted">No Image</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-text-primary">{brand.name}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{brand.productCount}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setEditingBrand(brand); setFormName(brand.name); setFormCoverImage(brand.coverImage ?? null); setFormError(null); setShowEditModal(true); }}
                        className="icon-btn text-accent-blue hover:bg-accent-blue/10"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => { setArchivingBrand(brand); setFormError(null); setShowArchiveModal(true); }}
                        className="icon-btn text-accent-red hover:bg-accent-red/10"
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

        {/* Pagination footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-card-border p-4">
          <p className="text-sm text-text-muted">
            Showing {startIndex} to {endIndex} of {brands.length} brands
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 text-sm text-text-secondary rounded border border-card-border hover:opacity-80 disabled:opacity-40">Previous</button>
              <span className="rounded-lg bg-btn-primary px-3 py-1.5 text-sm font-medium text-btn-primary-text">{page}</span>
              <span className="px-1 text-sm text-text-muted">/ {totalPages}</span>
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 text-sm text-text-secondary rounded border border-card-border hover:opacity-80 disabled:opacity-40">Next</button>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <Modal title="Add New Brand" onClose={() => setShowAddModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm text-text-primary bg-input-bg focus:outline-none focus:border-input-focus" />
            </div>
            <CoverImageField coverImage={formCoverImage} setCoverImage={setFormCoverImage} />
            {formError && <p className="text-sm text-accent-red">{formError}</p>}
            <div className="flex justify-end">
              <button onClick={handleAdd} disabled={createBrand.isPending} className="btn-grad px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">{createBrand.isPending ? 'Saving...' : 'Save Brand'}</button>
            </div>
          </div>
        </Modal>
      )}

      {showEditModal && editingBrand && (
        <Modal title="Edit Brand" onClose={() => { setShowEditModal(false); setEditingBrand(null); }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm text-text-primary bg-input-bg focus:outline-none focus:border-input-focus" />
            </div>
            <CoverImageField coverImage={formCoverImage} setCoverImage={setFormCoverImage} />
            {formError && <p className="text-sm text-accent-red">{formError}</p>}
            <div className="flex justify-end">
              <button onClick={handleEdit} disabled={updateBrand.isPending} className="btn-grad px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">{updateBrand.isPending ? 'Saving...' : 'Save Brand'}</button>
            </div>
          </div>
        </Modal>
      )}

      {showArchiveModal && archivingBrand && (
        <Modal title="Confirm Archive" onClose={() => { setShowArchiveModal(false); setArchivingBrand(null); }}>
          <div className="space-y-4">
            <p className="text-sm text-text-primary">Are you sure you want to archive <strong>{archivingBrand.name}</strong>?</p>
            {formError && <p className="text-sm text-accent-red">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowArchiveModal(false); setArchivingBrand(null); }} className="btn-secondary text-text-primary px-4 py-2 rounded text-sm font-medium">Cancel</button>
              <button onClick={handleArchive} disabled={archiveBrand.isPending} className="bg-btn-danger text-white px-4 py-2 rounded text-sm font-medium hover:opacity-90 transition disabled:opacity-60">{archiveBrand.isPending ? 'Archiving...' : 'Yes, Archive'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CoverImageField({ coverImage, setCoverImage }: { coverImage: string | null; setCoverImage: (v: string | null) => void }) {
  const [imageError, setImageError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setImageError(null);
    try {
      const dataUrl = await fileToResizedDataUrl(file, 512, 0.85);
      setCoverImage(dataUrl);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'Could not process the image.');
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1">Cover Image</label>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded bg-white/10 overflow-hidden flex items-center justify-center shrink-0">
          {coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverImage} alt="Brand cover preview" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] text-text-muted">No Image</span>
          )}
        </div>
        <div className="flex-1 space-y-1">
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} className="w-full text-xs text-text-secondary file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-btn-primary file:text-btn-primary-text file:text-xs" />
          {coverImage && (
            <button type="button" onClick={() => { setCoverImage(null); setImageError(null); }} className="text-xs text-accent-red hover:underline">Remove image</button>
          )}
          {imageError && <p className="text-xs text-accent-red">{imageError}</p>}
        </div>
      </div>
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
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
