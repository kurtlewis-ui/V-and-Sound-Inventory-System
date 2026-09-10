
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, Upload, Download, RefreshCw, FileDown, ClipboardList, ChevronDown, Archive, GripVertical, ArrowUpDown, Check } from 'lucide-react';
import {
  useProducts,
  useBrands,
  useBranches,
  useCreateProduct,
  useUpdateProduct,
  useArchiveProduct,
  useImportProducts,
  useRestock,
  useReorderProducts,
  useCreateVariant,
  useDeleteVariant,
  type ImportProductRow,
  type RestockItem,
} from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';
import { parseCsv, readFileAsText } from '@/lib/csv';
import { generateRestockXlsx, parseRestockXlsx, readFileAsArrayBuffer, type ProductRow } from '@/lib/xlsx-utils';
import { fileToResizedDataUrl } from '@/lib/image';
import { useAuthStore } from '@/lib/store';
import type { Product, ImportResult, RestockResult } from '@/lib/types';
import { StockHistoryModal } from '@/components/StockHistoryModal';
import { useToast } from '@/components/Toast';
import { Select } from '@/components/Select';
import { NumberStepper } from '@/components/NumberStepper';
import { useDragReorder } from '@/lib/useDragReorder';

const ENTRIES_OPTIONS = [5, 10, 25, 50, 100, 'All'] as const;

/** Resolve a product's price for a specific branch (per-branch override, else default). */
function priceForBranch(product: Product, branchId: string) {
  const override = product.quantities.find((q) => q.branchId === branchId)?.sellingPrice;
  return override != null ? override : product.sellingPrice;
}

function peso(n: number) {
  return `\u20B1${n.toFixed(2)}`;
}

export default function ProductsPage() {
  const { showToast, showError } = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [shopFilter, setShopFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [entriesPerPage, setEntriesPerPage] = useState<number | 'All'>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [reorderMode, setReorderMode] = useState(false);

  // Debounce search input by 300ms to prevent excessive API calls.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: branchData } = useBranches();
  const { data: brandData } = useBrands();
  const branches = branchData?.data ?? [];
  const brands = brandData?.data ?? [];
  const isAdmin = useAuthStore((s) => {
    const role = s.user?.role?.name;
    return role === 'Admin' || role === 'Owner';
  });
  const isOwner = useAuthStore((s) => s.user?.role?.name === 'Owner');

  // Pass branchId to backend for server-side filtering, and fetch ALL products
  // (limit: 200) so client-side pagination + drag reorder work correctly.
  const { data, isLoading, isError, error } = useProducts({
    search: debouncedSearch,
    brandId: brandFilter || undefined,
    branchId: shopFilter || undefined,
    limit: 200,
  });
  const products = data?.data ?? [];

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const archiveProduct = useArchiveProduct();
  const reorderProducts = useReorderProducts();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [formVariantType, setFormVariantType] = useState<'none' | 'flavor' | 'color'>('none');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [archivingProduct, setArchivingProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  const [formName, setFormName] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCostPrice, setFormCostPrice] = useState('');
  const [formAlert, setFormAlert] = useState('0');
  const [formImage, setFormImage] = useState<string | null>(null);
  const [formQuantities, setFormQuantities] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Reorder is only allowed on the plain, unfiltered, single-page list so the
  // drag order maps cleanly onto the whole product set (matches Daily Smokz).
  const canReorder = isAdmin && !debouncedSearch && !brandFilter && entriesPerPage === 'All';

  const totalPages = entriesPerPage === 'All' ? 1 : Math.max(1, Math.ceil(products.length / entriesPerPage));
  const displayProducts = entriesPerPage === 'All' ? products : products.slice((currentPage - 1) * entriesPerPage, currentPage * entriesPerPage);
  const branchesForForm = useMemo(() => branches, [branches]);
  // When a shop filter is active, the edit modal shows only that branch's
  // quantities (and its price). Intentional: the user is focused on that shop.
  // The backend only updates the branches included in the payload.
  const branchesForEdit = useMemo(() => {
    if (shopFilter) return branches.filter((b) => b.id === shopFilter);
    return branches;
  }, [branches, shopFilter]);

  // Drag-to-reorder: keeps a working copy while dragging; commits the order on
  // release. `rowProducts` is the drag copy when reordering, else the page slice.
  const { items: reorderItems, dragIndex, overIndex, startDrag, syncFromSource } = useDragReorder(products, {
    getId: (p) => p.id,
    onCommit: (orderedIds) => {
      reorderProducts.mutate(orderedIds, {
        onSuccess: () => showToast('Product order saved.', 'blue', 'check'),
        onError: (e) => showError(getApiErrorMessage(e)),
      });
    },
  });
  useEffect(() => {
    if (!reorderMode) syncFromSource();
  }, [products, reorderMode, syncFromSource]);
  const rowProducts = reorderMode ? reorderItems : displayProducts;

  // For variant products, compute total quantity from per-variant inventory at
  // the branch (instead of the base row which may be stale).
  function qtyForBranch(product: Product, branchId: string) {
    if (product.variantType !== 'none' && product.variants && product.variants.length > 0) {
      return product.variants.reduce((sum, v) => {
        const vQty = v.quantities?.find((q) => q.branchId === branchId)?.quantity ?? 0;
        return sum + vQty;
      }, 0);
    }
    return product.quantities.find((q) => q.branchId === branchId)?.quantity ?? 0;
  }

  // Live variants: read from the freshly-refetched products array so flavor
  // CRUD updates the modal instantly without a page refresh.
  const liveVariants = useMemo(() => {
    if (!editingProduct) return [];
    const fresh = products.find((p) => p.id === editingProduct.id);
    return fresh?.variants ?? editingProduct.variants ?? [];
  }, [products, editingProduct]);

  function openAddModal() {
    setShowTypeSelector(true);
  }
  function selectTypeAndOpenForm(type: 'none' | 'flavor' | 'color') {
    setFormVariantType(type);
    setShowTypeSelector(false);
    // Don't default to brands[0] — force an explicit pick to avoid silent
    // wrong-brand assignments.
    setFormName(''); setFormBrand(''); setFormPrice(''); setFormCostPrice(''); setFormAlert('0');
    setFormImage(null);
    const q: Record<string, string> = {}; branchesForForm.forEach((b) => (q[b.id] = ''));
    setFormQuantities(q); setFormError(null); setShowAddModal(true);
  }
  function openEditModal(product: Product) {
    setEditingProduct(product);
    setFormVariantType((product.variantType as 'none' | 'flavor' | 'color') ?? 'none');
    setFormName(product.name); setFormBrand(product.brand?.id ?? '');
    // When a shop is filtered, prefill the price with that branch's price so
    // the owner edits the per-shop price directly (product-level pricing).
    const prefillPrice = shopFilter ? priceForBranch(product, shopFilter) : product.sellingPrice;
    setFormPrice(prefillPrice.toString()); setFormCostPrice(product.costPrice?.toString() ?? ''); setFormAlert(product.quantityAlert.toString());
    setFormImage(product.image ?? null);
    const q: Record<string, string> = {};
    const variants = product.variants ?? [];
    if (variants.length > 0) {
      branchesForEdit.forEach((b) => {
        variants.forEach((v) => {
          const vQty = v.quantities?.find((vq) => vq.branchId === b.id)?.quantity ?? 0;
          q[`${b.id}__${v.id}`] = vQty.toString();
        });
      });
    } else {
      branchesForEdit.forEach((b) => { q[b.id] = (product.quantities.find((x) => x.branchId === b.id)?.quantity ?? 0).toString(); });
    }
    setFormQuantities(q); setFormError(null); setShowEditModal(true);
  }
  function buildQuantitiesPayload() {
    // Only send quantities for branches shown in the form.
    const targetBranches = showEditModal ? branchesForEdit : branchesForForm;
    // Per-branch product price is only editable when scoped to one shop.
    const branchPrice = shopFilter && showEditModal ? (parseFloat(formPrice) || 0) : undefined;
    // Check for flavor keys (branchId__variantId or name__variantId).
    const hasFlavorKeys = Object.keys(formQuantities).some((k) => k.includes('__') && !k.startsWith('name__'));
    if (hasFlavorKeys) {
      const entries: { branchId: string; variantId: string; variantName?: string; quantity: number; sellingPrice?: number }[] = [];
      const seen = new Set<string>();
      for (const [key, value] of Object.entries(formQuantities)) {
        if (!key.includes('__') || key.startsWith('name__')) continue;
        const [branchId, variantId] = key.split('__');
        if (!branchId || !variantId) continue;
        if (!targetBranches.some((b) => b.id === branchId)) continue;
        const dedupeKey = `${branchId}__${variantId}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const nameKey = `name__${variantId}`;
        const variantName = formQuantities[nameKey] || undefined;
        // Per-branch price rides on the variant row; the backend stores it on
        // the branch's product-level (variant_id NULL) inventory row.
        entries.push({ branchId, variantId, variantName, quantity: parseInt(value || '0') || 0, ...(branchPrice !== undefined ? { sellingPrice: branchPrice } : {}) });
      }
      return entries;
    }
    return targetBranches.map((b) => ({ branchId: b.id, quantity: parseInt(formQuantities[b.id] || '0') || 0, ...(branchPrice !== undefined ? { sellingPrice: branchPrice } : {}) }));
  }
  async function handleAdd() {
    if (!formName.trim()) { setFormError('Product name is required.'); return; }
    if (!formBrand) { setFormError('Please select a brand.'); return; }
    setFormError(null);
    try {
      await createProduct.mutateAsync({ name: formName.trim(), brandId: formBrand, variantType: formVariantType, sellingPrice: parseFloat(formPrice) || 0, costPrice: parseFloat(formCostPrice) || 0, quantityAlert: parseInt(formAlert) || 0, image: formImage ?? undefined, quantities: buildQuantitiesPayload() });
      setShowAddModal(false);
      showToast('Product has been created.', 'green', 'restore');
    } catch (e) { setFormError(getApiErrorMessage(e)); showError('Failed to create product.'); }
  }
  async function handleEdit() {
    if (!editingProduct || !formName.trim()) { setFormError('Product name is required.'); return; }
    if (!formBrand) { setFormError('Please select a brand.'); return; }
    setFormError(null);
    try {
      // When NOT scoped to a shop, formPrice is the product default. When scoped
      // to a shop, the price rides in quantities[].sellingPrice (per branch), so
      // leave the product default untouched.
      const payload: any = { id: editingProduct.id, name: formName.trim(), brandId: formBrand, costPrice: parseFloat(formCostPrice) || 0, quantityAlert: parseInt(formAlert) || 0, image: formImage ?? undefined, quantities: buildQuantitiesPayload() };
      if (!shopFilter) payload.sellingPrice = parseFloat(formPrice) || 0;
      await updateProduct.mutateAsync(payload);
      setEditingProduct(null); setShowEditModal(false);
      showToast('Product has been updated.', 'blue', 'check');
    } catch (e) { setFormError(getApiErrorMessage(e)); showError('Failed to update product.'); }
  }
  async function handleArchive() {
    if (!archivingProduct) return;
    try { await archiveProduct.mutateAsync(archivingProduct.id); setArchivingProduct(null); setShowArchiveModal(false); showToast('Product has been archived.', 'orange', 'archive'); }
    catch (e) { setFormError(getApiErrorMessage(e)); showError('Failed to archive product.'); }
  }

  function buildExportRows(): ProductRow[] {
    const rows: ProductRow[] = [];
    for (const p of products) {
      const type = p.variantType === 'flavor' ? 'Flavor' : p.variantType === 'color' ? 'Variant' : 'Cartridge';
      if (p.variants && p.variants.length > 0) {
        for (const v of p.variants) {
          rows.push({ productName: p.name, brand: p.brand?.name ?? '', type, variantName: v.name, sellingPrice: p.sellingPrice });
        }
      } else {
        rows.push({ productName: p.name, brand: p.brand?.name ?? '', type, variantName: '', sellingPrice: p.sellingPrice });
      }
    }
    return rows;
  }
  function handleExport() {
    const targetBranches = shopFilter ? branches.filter((b) => b.id === shopFilter) : branches;
    generateRestockXlsx(buildExportRows(), targetBranches, { filename: `products-export-${new Date().toISOString().slice(0, 10)}.xlsx` });
  }
  function handleTemplate() {
    const targetBranches = shopFilter ? branches.filter((b) => b.id === shopFilter) : branches;
    generateRestockXlsx(buildExportRows(), targetBranches, { filename: `restock-template-${new Date().toISOString().slice(0, 10)}.xlsx` });
  }

  const startIndex = entriesPerPage === 'All' ? 0 : (currentPage - 1) * (entriesPerPage as number);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Inventory</p>
          <h1 className="text-2xl font-bold text-text-primary">Products</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowImportModal(true)} className="btn-secondary flex items-center gap-1.5 text-text-primary px-3 py-2 rounded-lg text-sm font-medium"><Upload size={14} /> Import</button>
          <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5 text-text-primary px-3 py-2 rounded-lg text-sm font-medium"><Download size={14} /> Export</button>
          <button onClick={openAddModal} className="btn-grad flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm"><Plus size={14} /> Add Product</button>
        </div>
      </div>

      {/* Filters + restock */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={shopFilter}
          onChange={(v) => { setShopFilter(v); setCurrentPage(1); setReorderMode(false); }}
          options={[{ value: '', label: 'All Shops' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
          className="min-w-[170px]"
          ariaLabel="Shop"
        />
        <Select
          value={brandFilter}
          onChange={(v) => { setBrandFilter(v); setCurrentPage(1); setReorderMode(false); }}
          options={[{ value: '', label: 'All Brands' }, ...brands.map((b) => ({ value: b.id, label: b.name }))]}
          className="min-w-[170px]"
          ariaLabel="Brand"
        />
        <button onClick={() => setShowRestockModal(true)} className="btn-secondary flex items-center gap-1.5 text-text-primary px-3 py-2 rounded-lg text-sm font-medium"><RefreshCw size={14} /> Restock</button>
        <button onClick={handleTemplate} className="btn-secondary flex items-center gap-1.5 text-text-primary px-3 py-2 rounded-lg text-sm font-medium"><FileDown size={14} /> Restock Template</button>
        {isAdmin && (
          <button
            onClick={() => { if (canReorder) setReorderMode((r) => !r); }}
            disabled={!canReorder && !reorderMode}
            title={canReorder ? 'Drag rows to reorder' : "Set entries to 'All' and clear filters to reorder"}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${reorderMode ? 'bg-accent-blue/15 text-accent-blue border border-accent-blue/30' : 'btn-secondary text-text-primary disabled:opacity-50'}`}
          >
            {reorderMode ? <><Check size={14} /> Done</> : <><ArrowUpDown size={14} /> Reorder</>}
          </button>
        )}
      </div>

      {reorderMode && (
        <div className="rounded-lg bg-accent-blue/10 border border-accent-blue/30 px-4 py-2 text-xs text-accent-blue">
          Drag the <GripVertical size={12} className="inline" /> handle to reorder products. The order saves automatically when you drop a row.
        </div>
      )}

      {/* Entries + search */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span>Show</span>
          <Select
            value={entriesPerPage.toString()}
            onChange={(v) => { setEntriesPerPage(v === 'All' ? 'All' : parseInt(v)); setCurrentPage(1); }}
            options={ENTRIES_OPTIONS.map((o) => ({ value: o.toString(), label: o.toString() }))}
            className="min-w-[84px]"
            ariaLabel="Entries per page"
          />
          <span>entries</span>
        </div>
        <input type="text" placeholder="Search products..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="glass-select rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none w-full sm:w-56" />
      </div>

      {/* Desktop table */}
      <div className="glass rounded-2xl overflow-hidden elevate hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header/60">
                {reorderMode && <th className="w-10 px-2 py-3" />}
                <th className="text-left px-3 py-3 text-xs font-semibold uppercase text-table-header-text w-10">#</th>
                <th className="text-left px-3 py-3 text-xs font-semibold uppercase text-table-header-text w-16">Image</th>
                <th className="text-left px-3 py-3 text-xs font-semibold uppercase text-table-header-text">Name</th>
                <th className="text-left px-3 py-3 text-xs font-semibold uppercase text-table-header-text">Quantity</th>
                <th className="text-left px-3 py-3 text-xs font-semibold uppercase text-table-header-text">Brand</th>
                <th className="text-left px-3 py-3 text-xs font-semibold uppercase text-table-header-text">Selling Price</th>
                <th className="text-left px-3 py-3 text-xs font-semibold uppercase text-table-header-text">Qty Alert</th>
                <th className="text-right px-3 py-3 text-xs font-semibold uppercase text-table-header-text w-20"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={reorderMode ? 9 : 8} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading products...</td></tr>
              ) : isError ? (
                <tr><td colSpan={reorderMode ? 9 : 8} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
              ) : rowProducts.length === 0 ? (
                <tr><td colSpan={reorderMode ? 9 : 8} className="text-center py-8 text-text-muted">No products found. Add one or import a CSV.</td></tr>
              ) : (
                rowProducts.map((product, i) => (
                  <React.Fragment key={product.id}>
                  <tr
                    data-reorder-row
                    data-reorder-id={product.id}
                    className={`border-t border-card-border align-top transition-colors ${dragIndex === i ? 'opacity-60' : ''} ${overIndex === i && dragIndex !== i ? 'bg-accent-blue/5' : ''}`}
                  >
                    {reorderMode && (
                      <td className="px-2 py-3">
                        <button onPointerDown={(e) => startDrag(i, e)} className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text-primary touch-none" title="Drag to reorder"><GripVertical size={16} /></button>
                      </td>
                    )}
                    <td className="px-3 py-3 text-sm text-accent-blue font-medium font-mono">{reorderMode ? i + 1 : startIndex + i + 1}</td>
                    <td className="px-3 py-3">
                      {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image} alt={product.name} loading="lazy" className="w-10 h-10 rounded-lg object-cover bg-white/10" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-[10px] text-text-muted">No Img</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-text-primary font-medium">
                      {product.name}
                      {product.variantType !== 'none' && (
                        <span className="ml-2 badge badge-neutral text-[10px]">{product.variantType === 'color' ? 'Variants' : 'Flavors'}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      {shopFilter ? (
                        (() => {
                          const qty = qtyForBranch(product, shopFilter);
                          const isOut = qty <= 0;
                          const isLow = !isOut && product.quantityAlert > 0 && qty <= product.quantityAlert;
                          return (
                            <span className={`font-medium font-mono ${isOut ? 'text-accent-red' : isLow ? 'text-accent-orange' : 'text-text-primary'}`}>
                              {qty}
                              {isOut && <span className="ml-1 text-[10px]">(Out)</span>}
                              {isLow && <span className="ml-1 text-[10px]">(Low)</span>}
                            </span>
                          );
                        })()
                      ) : (
                        <div className="space-y-0.5">
                          {branches.map((b) => {
                            const qty = qtyForBranch(product, b.id);
                            const isOut = qty <= 0;
                            const isLow = !isOut && product.quantityAlert > 0 && qty <= product.quantityAlert;
                            return (
                              <div key={b.id} className="text-xs">
                                <span className="font-semibold text-text-primary">{b.name}:</span>{' '}
                                <span className={`font-mono ${isOut ? 'text-accent-red font-medium' : isLow ? 'text-accent-orange font-medium' : 'text-accent-blue'}`}>
                                  {qty}
                                  {isOut && <span className="ml-0.5 text-[9px]">(Out)</span>}
                                  {isLow && <span className="ml-0.5 text-[9px]">(Low)</span>}
                                </span>
                              </div>
                            );
                          })}
                          {branches.length === 0 && <span className="text-xs text-text-muted">No shops yet</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-text-primary">{product.brand?.name ?? '—'}</td>
                    <td className="px-3 py-3 text-sm text-text-primary font-mono">
                      {shopFilter ? (
                        peso(priceForBranch(product, shopFilter))
                      ) : (
                        <div className="space-y-0.5">
                          {branches.map((b) => (
                            <div key={b.id} className="text-xs">
                              <span className="font-semibold text-text-primary">{b.name}:</span>{' '}
                              <span className="text-text-secondary">{peso(priceForBranch(product, b.id))}</span>
                            </div>
                          ))}
                          {branches.length === 0 && <span>{peso(product.sellingPrice)}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      {product.quantityAlert > 0 ? (<span className="badge badge-neutral"><span className="badge-dot bg-accent-orange" />{product.quantityAlert}</span>) : (<span className="text-text-muted">{product.quantityAlert}</span>)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {shopFilter && product.variants && product.variants.length > 0 && (
                          <button onClick={() => setExpandedProductId(expandedProductId === product.id ? null : product.id)} className={`icon-btn transition ${expandedProductId === product.id ? 'text-accent-blue bg-accent-blue/10' : 'text-text-secondary hover:bg-white/10'}`} title="Stock by flavor">
                            <ChevronDown size={16} className={`transition-transform ${expandedProductId === product.id ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                        {shopFilter && <button onClick={() => setHistoryProduct(product)} className="icon-btn text-text-secondary hover:bg-white/10" title="Stock History"><ClipboardList size={16} /></button>}
                        <button onClick={() => openEditModal(product)} className="icon-btn text-accent-blue hover:bg-accent-blue/10" title="Edit"><Pencil size={16} /></button>
                        <button onClick={() => { setArchivingProduct(product); setFormError(null); setShowArchiveModal(true); }} className="icon-btn text-accent-orange hover:bg-accent-orange/10" title="Archive"><Archive size={16} /></button>
                      </div>
                    </td>
                  </tr>
                  {expandedProductId === product.id && shopFilter && (
                    <tr className="border-t border-card-border bg-white/[0.02]">
                      <td colSpan={reorderMode ? 9 : 8} className="px-3 py-3">
                        <div className="rounded-lg border border-card-border p-3 bg-white/5">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold text-text-primary">
                              {product.variantType === 'color' ? 'Colors' : 'Flavors'} — Stock
                            </h4>
                            <button onClick={() => setExpandedProductId(null)} className="text-text-muted hover:text-text-primary"><X size={14} /></button>
                          </div>
                          <div className="space-y-1">
                            {product.variants.map((v) => {
                              const vQty = v.quantities?.find((q) => q.branchId === shopFilter)?.quantity ?? 0;
                              const isOut = vQty <= 0;
                              const isLow = !isOut && product.quantityAlert > 0 && vQty <= product.quantityAlert;
                              return (
                                <div key={v.id} className="flex items-center justify-between rounded bg-white/5 px-2.5 py-1.5 text-sm">
                                  <span className="font-medium text-text-primary">{v.name}</span>
                                  <span className={`text-xs font-medium font-mono ${isOut ? 'text-accent-red' : isLow ? 'text-accent-orange' : 'text-accent-blue'}`}>
                                    {vQty}{isOut ? ' · Out' : isLow ? ' · Low' : ''}
                                  </span>
                                </div>
                              );
                            })}
                            <div className="flex items-center justify-between rounded px-2.5 py-1 text-xs border-t border-card-border mt-1 pt-1">
                              <span className="font-semibold text-text-primary">TOTAL</span>
                              <span className="font-semibold text-text-primary font-mono">{product.variants.reduce((sum, v) => sum + (v.quantities?.find((q) => q.branchId === shopFilter)?.quantity ?? 0), 0)}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="glass rounded-2xl p-6 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading products...</div>
        ) : isError ? (
          <div className="glass rounded-2xl p-6 text-center text-accent-red">{getApiErrorMessage(error)}</div>
        ) : rowProducts.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center text-text-muted">No products found. Add one or import a CSV.</div>
        ) : (
          rowProducts.map((product, i) => (
            <div key={product.id} data-reorder-row data-reorder-id={product.id} className={`glass rounded-2xl p-4 ${dragIndex === i ? 'opacity-60' : ''} ${overIndex === i && dragIndex !== i ? 'ring-1 ring-accent-blue/40' : ''}`}>
              <div className="flex items-start gap-3">
                {reorderMode && (
                  <button onPointerDown={(e) => startDrag(i, e)} className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text-primary touch-none mt-1" title="Drag to reorder"><GripVertical size={18} /></button>
                )}
                {product.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.image} alt={product.name} loading="lazy" className="w-14 h-14 rounded-lg object-cover bg-white/10 shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-white/10 flex items-center justify-center text-[10px] text-text-muted shrink-0">No Img</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-text-primary">{product.name}</p>
                    {product.variantType !== 'none' && (
                      <span className="badge badge-neutral text-[10px]">{product.variantType === 'color' ? 'Variants' : 'Flavors'}</span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">{product.brand?.name ?? '—'}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {shopFilter && <button onClick={() => setHistoryProduct(product)} className="flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary hover:bg-white/10" title="Stock History"><ClipboardList size={18} /></button>}
                  <button onClick={() => openEditModal(product)} className="flex h-11 w-11 items-center justify-center rounded-lg text-accent-blue hover:bg-accent-blue/10" title="Edit"><Pencil size={18} /></button>
                  <button onClick={() => { setArchivingProduct(product); setFormError(null); setShowArchiveModal(true); }} className="flex h-11 w-11 items-center justify-center rounded-lg text-accent-orange hover:bg-accent-orange/10" title="Archive"><Archive size={18} /></button>
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-surface-muted p-2.5 space-y-1.5">
                {(shopFilter ? branches.filter((b) => b.id === shopFilter) : branches).map((b) => {
                  const qty = qtyForBranch(product, b.id);
                  const isOut = qty <= 0;
                  const isLow = !isOut && product.quantityAlert > 0 && qty <= product.quantityAlert;
                  return (
                    <div key={b.id} className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text-primary">{b.name}</span>
                      <span className="flex items-center gap-3">
                        <span className={`font-mono ${isOut ? 'text-accent-red' : isLow ? 'text-accent-orange' : 'text-accent-blue'}`}>{qty}{isOut ? ' (Out)' : isLow ? ' (Low)' : ''} pcs</span>
                        <span className="font-mono text-text-secondary">{peso(priceForBranch(product, b.id))}</span>
                      </span>
                    </div>
                  );
                })}
                {branches.length === 0 && <span className="text-xs text-text-muted">No shops yet</span>}
              </div>
              {/* Per-flavor breakdown on mobile when a shop is selected */}
              {shopFilter && product.variants && product.variants.length > 0 && (
                <div className="mt-2 space-y-1">
                  {product.variants.map((v) => {
                    const vQty = v.quantities?.find((q) => q.branchId === shopFilter)?.quantity ?? 0;
                    return (
                      <div key={v.id} className="flex items-center justify-between text-xs px-1">
                        <span className="text-text-secondary">{v.name}</span>
                        <span className="font-mono text-accent-blue">{vQty}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between text-[11px] text-text-muted">
                <span>Qty Alert: {product.quantityAlert}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {!reorderMode && (
        <div className="flex items-center justify-between text-sm text-text-secondary flex-wrap gap-2">
          <span>Showing {rowProducts.length === 0 ? 0 : startIndex + 1} to {entriesPerPage === 'All' ? products.length : Math.min(currentPage * (entriesPerPage as number), products.length)} of {products.length} products</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="px-2 py-1 rounded border border-card-border disabled:opacity-50">Previous</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (<button key={p} onClick={() => setCurrentPage(p)} className={`px-2.5 py-1 rounded ${p === currentPage ? 'bg-btn-primary text-btn-primary-text' : 'border border-card-border hover:opacity-80'}`}>{p}</button>))}
              <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="px-2 py-1 rounded border border-card-border disabled:opacity-50">Next</button>
            </div>
          )}
        </div>
      )}

      {/* Add-product type selector */}
      {showTypeSelector && (
        <Modal title="Add New Product" onClose={() => setShowTypeSelector(false)}>
          <p className="text-sm text-text-secondary mb-4">What type of product is this?</p>
          <div className="grid grid-cols-3 gap-3">
            <button onClick={() => selectTypeAndOpenForm('flavor')} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-card-border bg-white/5 hover:border-white/30 hover:bg-white/10 transition spring">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-secondary"><path d="M12 2C12 2 8 6 8 10c0 2.2 1.8 4 4 4s4-1.8 4-4c0-4-4-8-4-8z"/><path d="M12 14v8"/></svg>
              <span className="text-sm font-semibold text-text-primary">Flavors</span>
              <span className="text-[10px] text-text-muted text-center">Pods · Dispo · Juice</span>
            </button>
            <button onClick={() => selectTypeAndOpenForm('color')} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-card-border bg-white/5 hover:border-white/30 hover:bg-white/10 transition spring">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-secondary"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              <span className="text-sm font-semibold text-text-primary">Variants</span>
              <span className="text-[10px] text-text-muted text-center">Devices</span>
            </button>
            <button onClick={() => selectTypeAndOpenForm('none')} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-card-border bg-white/5 hover:border-white/30 hover:bg-white/10 transition spring">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-secondary"><path d="M7 2h10l2 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6l2-4z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="13" y2="14"/><path d="M10 6h4"/></svg>
              <span className="text-sm font-semibold text-text-primary">Cartridges</span>
              <span className="text-[10px] text-text-muted text-center">Others</span>
            </button>
          </div>
        </Modal>
      )}
      {showAddModal && (
        <ProductFormModal title="Add New Product" onClose={() => setShowAddModal(false)} onSubmit={handleAdd} error={formError} buttonLabel={createProduct.isPending ? 'Saving...' : 'Save Product'} disabled={createProduct.isPending} formName={formName} setFormName={setFormName} formBrand={formBrand} setFormBrand={setFormBrand} formPrice={formPrice} setFormPrice={setFormPrice} formCostPrice={formCostPrice} setFormCostPrice={setFormCostPrice} isOwner={isOwner} formAlert={formAlert} setFormAlert={setFormAlert} formImage={formImage} setFormImage={setFormImage} isAdmin={isAdmin} formQuantities={formQuantities} setFormQuantities={setFormQuantities} branches={branchesForForm} brands={brands} variantType={formVariantType} shopScoped={!!shopFilter} />
      )}
      {showEditModal && editingProduct && (
        <ProductFormModal title="Edit Product" onClose={() => { setShowEditModal(false); setEditingProduct(null); }} onSubmit={handleEdit} error={formError} buttonLabel={updateProduct.isPending ? 'Saving...' : 'Update Product'} disabled={updateProduct.isPending} formName={formName} setFormName={setFormName} formBrand={formBrand} setFormBrand={setFormBrand} formPrice={formPrice} setFormPrice={setFormPrice} formCostPrice={formCostPrice} setFormCostPrice={setFormCostPrice} isOwner={isOwner} formAlert={formAlert} setFormAlert={setFormAlert} formImage={formImage} setFormImage={setFormImage} isAdmin={isAdmin} formQuantities={formQuantities} setFormQuantities={setFormQuantities} branches={branchesForEdit} brands={brands} variants={liveVariants} variantType={editingProduct.variantType ?? 'none'} productId={editingProduct.id} shopScoped={!!shopFilter} shopName={shopFilter ? branches.find((b) => b.id === shopFilter)?.name : undefined} />
      )}
      {showArchiveModal && archivingProduct && (
        <Modal title="Confirm Archive" onClose={() => { setShowArchiveModal(false); setArchivingProduct(null); }}>
          <div className="space-y-4">
            <p className="text-sm text-text-primary">Are you sure you want to archive <strong>{archivingProduct.name}</strong>?</p>
            {formError && <p className="text-sm text-accent-red">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowArchiveModal(false); setArchivingProduct(null); }} className="btn-secondary text-text-primary px-4 py-2 rounded-lg text-sm font-medium">Cancel</button>
              <button onClick={handleArchive} disabled={archiveProduct.isPending} className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 transition">{archiveProduct.isPending ? 'Archiving...' : 'Yes, Archive'}</button>
            </div>
          </div>
        </Modal>
      )}
      {showImportModal && <ImportModal branches={branches} onClose={() => setShowImportModal(false)} />}
      {showRestockModal && <RestockModal branchId={shopFilter || undefined} branches={shopFilter ? branches.filter((b) => b.id === shopFilter) : branches} onClose={() => setShowRestockModal(false)} />}
      {historyProduct && shopFilter && <StockHistoryModal productId={historyProduct.id} productName={historyProduct.name} branchId={shopFilter} branchName={branches.find((b) => b.id === shopFilter)?.name ?? ''} onClose={() => setHistoryProduct(null)} />}
    </div>
  );
}

function ImportModal({ branches, onClose }: { branches: { id: string; name: string }[]; onClose: () => void }) {
  const importProducts = useImportProducts();
  const [rows, setRows] = useState<ImportProductRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const branchNameSet = new Set(branches.map((b) => b.name.toLowerCase()));

  async function onFile(file: File) {
    setError(null); setResult(null);
    try {
      const text = await readFileAsText(file);
      const { headers, rows: csvRows } = parseCsv(text);
      const required = ['Name', 'Brand', 'SellingPrice'];
      const missing = required.filter((h) => !headers.includes(h));
      if (missing.length) { setError(`Missing required column(s): ${missing.join(', ')}`); return; }
      const branchCols = headers.filter((h) => branchNameSet.has(h.toLowerCase()));
      const parsed: ImportProductRow[] = csvRows
        .filter((r) => r.Name?.trim())
        .map((r) => ({
          name: r.Name.trim(),
          brand: (r.Brand || '').trim(),
          sellingPrice: Number(r.SellingPrice) || 0,
          quantityAlert: Number(r.QuantityAlert) || 0,
          quantities: branchCols
            .map((col) => ({ branchName: col, quantity: Number(r[col]) || 0 }))
            .filter((q) => q.quantity > 0),
        }));
      setRows(parsed);
      setFileName(file.name);
    } catch (e) { setError('Could not read the file.'); }
  }

  async function submit() {
    if (rows.length === 0) { setError('No valid rows to import.'); return; }
    setError(null);
    try { setResult(await importProducts.mutateAsync(rows)); }
    catch (e) { setError(getApiErrorMessage(e)); }
  }

  return (
    <Modal title="Import Products (CSV)" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-text-muted">
          CSV columns: <strong>Name, Brand, SellingPrice, QuantityAlert</strong>, plus one column per shop name for stock. Brands are created automatically if they don&apos;t exist. Existing products (matched by name) are updated.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="w-full text-sm text-text-secondary file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-btn-primary file:text-btn-primary-text file:text-sm file:font-medium file:cursor-pointer" />
        {fileName && <p className="text-sm text-text-secondary">Parsed <strong>{rows.length}</strong> row(s) from {fileName}.</p>}
        {error && <p className="text-sm text-accent-red">{error}</p>}
        {result && (
          <div className="rounded-lg bg-accent-green/10 border border-accent-green/30 px-3 py-2 text-sm text-text-primary">
            <p>Imported: <strong>{result.created}</strong> created, <strong>{result.updated}</strong> updated (of {result.total}).</p>
            {result.warnings.length > 0 && (
              <ul className="mt-1 list-disc list-inside text-accent-orange text-xs max-h-28 overflow-y-auto">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-text-primary px-4 py-2 rounded-lg text-sm font-medium">{result ? 'Done' : 'Cancel'}</button>
          {!result && <button onClick={submit} disabled={importProducts.isPending || rows.length === 0} className="btn-grad px-4 py-2 rounded-lg text-sm disabled:opacity-60">{importProducts.isPending ? 'Importing...' : `Import ${rows.length || ''}`}</button>}
        </div>
      </div>
    </Modal>
  );
}

function RestockModal({ branchId, branches, onClose }: { branchId?: string; branches: { id: string; name: string }[]; onClose: () => void }) {
  const restock = useRestock();
  const [items, setItems] = useState<{ productName: string; variantName: string; branchId: string; quantity: number }[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RestockResult | null>(null);

  async function onFile(file: File) {
    setError(null); setResult(null); setItems([]); setFileName('');
    try { const buffer = await readFileAsArrayBuffer(file); const parsed = parseRestockXlsx(buffer, branches, branchId); setItems(parsed.items); setFileName(file.name); } catch { setError('Could not read the file.'); }
  }

  async function submit() {
    if (items.length === 0) { setError('No stock to add. Fill in the "Add Quantity" column and re-upload.'); return; }
    setError(null);
    try { const restockItems: RestockItem[] = items.map((i) => ({ productName: i.productName, variantName: i.variantName || undefined, branchId: i.branchId, quantity: i.quantity })); setResult(await restock.mutateAsync(restockItems)); } catch (e) { setError(getApiErrorMessage(e)); }
  }

  return (
    <Modal title="Restock Products" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-text-muted">Upload your exported file (.xlsx) with the <strong>Add Quantity</strong> column filled in. Numbers are <strong>added</strong> to current stock.</p>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="w-full text-sm text-text-secondary file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-btn-primary file:text-btn-primary-text file:text-sm file:font-medium file:cursor-pointer" />
        {fileName && (<p className="text-sm text-text-secondary">Found <strong>{items.length}</strong> stock addition(s) across <strong>{new Set(items.map((i) => i.productName)).size}</strong> product(s) from {fileName}.</p>)}
        {error && <p className="text-sm text-accent-red">{error}</p>}
        {result && (<div className="rounded-lg bg-accent-green/10 border border-accent-green/30 px-3 py-2 text-sm text-text-primary">Restocked <strong>{result.updated}</strong> of {result.total} entries.{result.warnings.length > 0 && <ul className="mt-1 list-disc list-inside text-accent-orange text-xs max-h-28 overflow-y-auto">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}</div>)}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-text-primary px-4 py-2 rounded-lg text-sm font-medium">{result ? 'Done' : 'Cancel'}</button>
          {!result && <button onClick={submit} disabled={restock.isPending || items.length === 0} className="btn-grad px-4 py-2 rounded-lg text-sm disabled:opacity-60">{restock.isPending ? 'Restocking...' : 'Restock'}</button>}
        </div>
      </div>
    </Modal>
  );
}

function ProductFormModal({ title, onClose, onSubmit, buttonLabel, disabled, error, formName, setFormName, formBrand, setFormBrand, formPrice, setFormPrice, formCostPrice, setFormCostPrice, isOwner, formAlert, setFormAlert, formImage, setFormImage, isAdmin, formQuantities, setFormQuantities, branches, brands, variants, variantType, productId, shopScoped, shopName }: { title: string; onClose: () => void; onSubmit: () => void; buttonLabel: string; disabled?: boolean; error?: string | null; formName: string; setFormName: (v: string) => void; formBrand: string; setFormBrand: (v: string) => void; formPrice: string; setFormPrice: (v: string) => void; formCostPrice: string; setFormCostPrice: (v: string) => void; isOwner: boolean; formAlert: string; setFormAlert: (v: string) => void; formImage: string | null; setFormImage: (v: string | null) => void; isAdmin: boolean; formQuantities: Record<string, string>; setFormQuantities: (v: Record<string, string>) => void; branches: { id: string; name: string }[]; brands: { id: string; name: string }[]; variants?: { id: string; name: string }[]; variantType?: 'none' | 'flavor' | 'color'; productId?: string; shopScoped?: boolean; shopName?: string; }) {
  const [imageError, setImageError] = useState<string | null>(null);
  const [addingFlavor, setAddingFlavor] = useState(false);
  const [newFlavorName, setNewFlavorName] = useState('');
  const [flavorError, setFlavorError] = useState<string | null>(null);
  const [deletingVariantId, setDeletingVariantId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deletedId, setDeletedId] = useState<string | null>(null);
  const createVariant = useCreateVariant();
  const deleteVariant = useDeleteVariant();

  async function handleImageFile(file: File) { setImageError(null); try { const dataUrl = await fileToResizedDataUrl(file, 512, 0.85); setFormImage(dataUrl); } catch (e) { setImageError(e instanceof Error ? e.message : 'Could not process the image.'); } }

  async function handleDeleteFlavor(variantId: string) { setDeleteLoading(true); try { await deleteVariant.mutateAsync(variantId); setDeletedId(variantId); setTimeout(() => { setDeletedId(null); setDeletingVariantId(null); }, 300); } catch (e) { setFlavorError(getApiErrorMessage(e)); } finally { setDeleteLoading(false); } }

  async function handleAddFlavor() { if (!newFlavorName.trim()) { setFlavorError('Name is required'); return; } setFlavorError(null); if (productId) { try { const created = await createVariant.mutateAsync({ productId, name: newFlavorName.trim(), sellingPrice: 0 }); if (created?.id && branches.length === 1) { setFormQuantities({ ...formQuantities, [`${branches[0].id}__${created.id}`]: '0', [`name__${created.id}`]: newFlavorName.trim() }); } setNewFlavorName(''); setAddingFlavor(false); } catch (e) { setFlavorError(getApiErrorMessage(e)); } } else { const tempId = `new_${Date.now()}`; const updated = { ...formQuantities, [`name__${tempId}`]: newFlavorName.trim() }; if (branches.length === 1) { updated[`${branches[0].id}__${tempId}`] = '0'; } setFormQuantities(updated); setNewFlavorName(''); setAddingFlavor(false); } }

  function removeLocalFlavor(tempId: string) { const updated = { ...formQuantities }; Object.keys(updated).forEach((k) => { if (k.endsWith(`__${tempId}`) || k === `name__${tempId}`) delete updated[k]; }); setFormQuantities(updated); }

  const setQty = (key: string, value: string) => setFormQuantities({ ...formQuantities, [key]: value });

  const variantLabel = variantType === 'color' ? 'Color' : 'Flavor';
  const variantLabelPlural = variantType === 'color' ? 'Colors' : 'Flavors';
  const isVariantProduct = !!variantType && variantType !== 'none';
  const localFlavors = !productId ? Object.keys(formQuantities).filter((k) => k.startsWith('name__')).map((k) => ({ id: k.replace('name__', ''), name: formQuantities[k] })) : [];
  const displayVariants = productId ? (variants ?? []) : localFlavors;

  const labelCls = 'block text-sm font-medium text-text-primary mb-1.5';
  const inputCls = 'w-full glass-select rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none';

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
        {/* Name */}
        <div>
          <label className={labelCls}>Name</label>
          <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className={inputCls} placeholder="e.g. RELX Pods" />
        </div>

        {/* Photo */}
        <div>
          <label className={labelCls}>Photo</label>
          <div className="flex items-center gap-3 rounded-xl border border-card-border bg-white/[0.03] p-3">
            <div className="w-16 h-16 rounded-lg bg-white/10 overflow-hidden flex items-center justify-center shrink-0">
              {formImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={formImage} alt="Preview" className="w-full h-full object-cover" />
              ) : (<span className="text-[10px] text-text-muted">No Image</span>)}
            </div>
            {isAdmin ? (
              <div className="flex-1 space-y-1.5">
                <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])} className="w-full text-xs text-text-secondary file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-btn-primary file:text-btn-primary-text file:text-xs file:font-medium file:cursor-pointer" />
                {formImage && (<button type="button" onClick={() => { setFormImage(null); setImageError(null); }} className="text-xs text-accent-red hover:underline">Remove image</button>)}
                {imageError && <p className="text-xs text-accent-red">{imageError}</p>}
              </div>
            ) : (<p className="flex-1 text-xs text-text-muted">Only an admin can change the product image.</p>)}
          </div>
        </div>

        {/* Flavors / Colors OR plain quantity */}
        {isVariantProduct ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-text-primary">{variantLabelPlural}</label>
              {!addingFlavor && (
                <button type="button" onClick={() => { setAddingFlavor(true); setFlavorError(null); }} className="flex items-center gap-1 text-xs font-medium text-accent-blue hover:underline"><Plus size={12} /> Add {variantLabel}</button>
              )}
            </div>
            {addingFlavor && (
              <div className="flex items-center gap-2 mb-2">
                <input type="text" value={newFlavorName} onChange={(e) => setNewFlavorName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddFlavor(); } }} placeholder={`New ${variantLabel.toLowerCase()} name...`} className="flex-1 glass-select rounded-lg px-3 py-2 text-sm bg-input-bg focus:outline-none" autoFocus />
                <button type="button" onClick={handleAddFlavor} disabled={createVariant.isPending} className="btn-grad px-3 py-2 rounded-lg text-xs disabled:opacity-60">{createVariant.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Add'}</button>
                <button type="button" onClick={() => { setAddingFlavor(false); setNewFlavorName(''); setFlavorError(null); }} className="text-xs text-text-muted hover:text-text-primary px-1">Cancel</button>
              </div>
            )}
            {displayVariants.length > 0 ? (
              <div className="space-y-2">
                {displayVariants.map((v) => (
                  <div key={v.id} className={`flex items-center gap-2 rounded-lg border border-card-border bg-white/5 px-3 py-2 transition-all duration-300 ${deletedId === v.id ? 'opacity-0 scale-95 border-red-500/30 bg-red-500/5' : ''}`}>
                    <input type="text" value={formQuantities[`name__${v.id}`] ?? v.name} onChange={(e) => setQty(`name__${v.id}`, e.target.value)} className="flex-1 min-w-0 glass-select rounded-lg px-3 py-2 text-sm bg-input-bg focus:outline-none" placeholder={`${variantLabel} name`} />
                    {branches.length === 1 && (
                      <NumberStepper value={formQuantities[`${branches[0].id}__${v.id}`] ?? ''} onChange={(val) => setQty(`${branches[0].id}__${v.id}`, val)} min={0} className="w-28 shrink-0" ariaLabel={`${v.name} quantity`} />
                    )}
                    {productId ? (
                      <button type="button" onClick={() => setDeletingVariantId(v.id)} className="p-2 text-text-muted hover:text-accent-red transition shrink-0" title={`Delete ${variantLabel.toLowerCase()}`}><Trash2 size={15} /></button>
                    ) : (
                      <button type="button" onClick={() => removeLocalFlavor(v.id)} className="p-2 text-text-muted hover:text-accent-red transition shrink-0" title={`Remove ${variantLabel.toLowerCase()}`}><Trash2 size={15} /></button>
                    )}
                  </div>
                ))}
              </div>
            ) : (<p className="text-xs text-text-muted">No {variantLabelPlural.toLowerCase()} yet. Add one to set stock.</p>)}
            {branches.length > 1 && displayVariants.length > 0 && (<p className="text-xs text-accent-orange mt-2">Select a shop in the filter to edit per-{variantLabel.toLowerCase()} stock.</p>)}
            {flavorError && <p className="text-xs text-accent-red mt-1">{flavorError}</p>}
          </div>
        ) : (
          <div>
            <label className={labelCls}>Quantity{branches.length === 1 ? ` (${branches[0].name})` : ' per shop'}</label>
            <div className="space-y-2">
              {branches.length === 0 && <p className="text-xs text-text-muted">No shops yet.</p>}
              {branches.map((b) => (
                <div key={b.id} className="flex items-center gap-2">
                  {branches.length > 1 && <span className="text-xs font-medium text-text-primary bg-white/10 px-2.5 py-2 rounded-lg min-w-[140px]">{b.name}</span>}
                  <NumberStepper value={formQuantities[b.id] ?? ''} onChange={(val) => setQty(b.id, val)} min={0} className="flex-1" ariaLabel={`${b.name} quantity`} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Brand */}
        <div>
          <label className={labelCls}>Brand</label>
          <Select value={formBrand} onChange={setFormBrand} options={[{ value: '', label: 'Select a brand' }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} className="w-full" ariaLabel="Brand" />
        </div>

        {/* Selling price — per-shop when scoped */}
        <div>
          <label className={labelCls}>
            Selling Price (₱){shopScoped && shopName ? <span className="ml-1 text-[10px] text-accent-blue font-normal">for {shopName}</span> : null}
          </label>
          <input type="number" step="0.01" min="0" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} className={inputCls} placeholder="0.00" />
          {shopScoped && <p className="mt-1 text-[11px] text-text-muted">This price applies to <strong>{shopName}</strong> only. All flavors/colors share this price.</p>}
        </div>

        {/* Cost price — owner only */}
        {isOwner && (
          <div>
            <label className={labelCls}>Cost Price (₱) <span className="text-[10px] text-accent-primary font-normal">Owner Only</span></label>
            <input type="number" step="0.01" min="0" value={formCostPrice} onChange={(e) => setFormCostPrice(e.target.value)} placeholder="0" className={inputCls} />
          </div>
        )}

        {/* Quantity alert */}
        <div>
          <label className={labelCls}>Quantity Alert</label>
          <NumberStepper value={formAlert} onChange={setFormAlert} min={0} className="w-full" ariaLabel="Quantity alert" />
        </div>

        {error && <p className="text-sm text-accent-red">{error}</p>}
        <div className="flex justify-end pt-1">
          <button type="button" onClick={onSubmit} disabled={disabled} className="btn-grad px-5 py-2.5 rounded-lg text-sm disabled:opacity-60">{buttonLabel}</button>
        </div>
      </div>
      {deletingVariantId && (
        <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center z-10">
          <div className="glass rounded-xl p-5 shadow-xl max-w-xs w-full mx-4 space-y-3">
            <p className="text-sm text-text-primary">Are you sure you want to delete <strong>{(variants ?? []).find((v) => v.id === deletingVariantId)?.name ?? 'this item'}</strong>?</p>
            <p className="text-xs text-text-muted">This will be archived.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setDeletingVariantId(null)} className="px-3 py-1.5 text-sm text-text-secondary border border-card-border rounded-lg hover:bg-white/5 transition">Cancel</button>
              <button type="button" onClick={() => handleDeleteFlavor(deletingVariantId)} disabled={deleteLoading} className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-60">{deleteLoading ? <Loader2 size={14} className="animate-spin" /> : 'Yes, Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 elevate-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text-primary">{title}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
