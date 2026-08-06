'use client';

import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, Upload, Download, RefreshCw, FileDown, ClipboardList } from 'lucide-react';
import {
  useProducts,
  useBrands,
  useBranches,
  useCreateProduct,
  useUpdateProduct,
  useArchiveProduct,
  useImportProducts,
  useRestock,
  type ImportProductRow,
  type RestockItem,
} from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';
import { parseCsv, readFileAsText } from '@/lib/csv';
import { generateRestockXlsx, parseRestockXlsx, matchSlugToShopName, readFileAsArrayBuffer, type ProductRow } from '@/lib/xlsx-utils';
import { fileToResizedDataUrl } from '@/lib/image';
import { useAuthStore } from '@/lib/store';
import type { Product, ImportResult, RestockResult } from '@/lib/types';
import { StockHistoryModal } from '@/components/StockHistoryModal';

const ENTRIES_OPTIONS = [5, 10, 25, 50, 100, 'All'] as const;

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [shopFilter, setShopFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [entriesPerPage, setEntriesPerPage] = useState<number | 'All'>(10);
  const [currentPage, setCurrentPage] = useState(1);

  const { data: branchData } = useBranches();
  const { data: brandData } = useBrands();
  const branches = branchData?.data ?? [];
  const brands = brandData?.data ?? [];
  const isAdmin = useAuthStore((s) => {
    const role = s.user?.role?.name;
    return role === 'Admin' || role === 'Owner';
  });
  const isOwner = useAuthStore((s) => s.user?.role?.name === 'Owner');

  const { data, isLoading, isError, error } = useProducts({ search, brandId: brandFilter || undefined });
  const products = data?.data ?? [];

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const archiveProduct = useArchiveProduct();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
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

  const totalPages = entriesPerPage === 'All' ? 1 : Math.max(1, Math.ceil(products.length / entriesPerPage));
  const displayProducts = entriesPerPage === 'All' ? products : products.slice((currentPage - 1) * entriesPerPage, currentPage * entriesPerPage);
  const branchesForForm = useMemo(() => branches, [branches]);
  // When a specific shop is selected, only show that shop's quantity in the form
  const branchesForEdit = useMemo(() => {
    if (shopFilter) return branches.filter((b) => b.id === shopFilter);
    return branches;
  }, [branches, shopFilter]);

  function qtyForBranch(product: Product, branchId: string) {
    return product.quantities.find((q) => q.branchId === branchId)?.quantity ?? 0;
  }

  function openAddModal() {
    setFormName(''); setFormBrand(brands[0]?.id ?? ''); setFormPrice(''); setFormAlert('0');
    setFormImage(null);
    const q: Record<string, string> = {}; branchesForForm.forEach((b) => (q[b.id] = ''));
    setFormQuantities(q); setFormError(null); setShowAddModal(true);
  }
  function openEditModal(product: Product) {
    setEditingProduct(product);
    setFormName(product.name); setFormBrand(product.brand?.id ?? brands[0]?.id ?? '');
    setFormPrice(product.sellingPrice.toString()); setFormCostPrice(''); setFormAlert(product.quantityAlert.toString());
    setFormImage(product.image ?? null);
    const q: Record<string, string> = {};
    branchesForEdit.forEach((b) => { q[b.id] = (product.quantities.find((x) => x.branchId === b.id)?.quantity ?? 0).toString(); });
    setFormQuantities(q); setFormError(null); setShowEditModal(true);
  }
  function buildQuantitiesPayload() {
    // Only send quantities for branches shown in the form
    const targetBranches = showEditModal ? branchesForEdit : branchesForForm;
    return targetBranches.map((b) => ({ branchId: b.id, quantity: parseInt(formQuantities[b.id] || '0') || 0 }));
  }
  async function handleAdd() {
    if (!formName.trim()) { setFormError('Product name is required.'); return; }
    if (!formBrand) { setFormError('Please select a brand.'); return; }
    setFormError(null);
    try {
      await createProduct.mutateAsync({ name: formName.trim(), brandId: formBrand, sellingPrice: parseFloat(formPrice) || 0, costPrice: parseFloat(formCostPrice) || 0, quantityAlert: parseInt(formAlert) || 0, image: formImage ?? undefined, quantities: buildQuantitiesPayload() });
      setShowAddModal(false);
    } catch (e) { setFormError(getApiErrorMessage(e)); }
  }
  async function handleEdit() {
    if (!editingProduct || !formName.trim()) { setFormError('Product name is required.'); return; }
    if (!formBrand) { setFormError('Please select a brand.'); return; }
    setFormError(null);
    try {
      await updateProduct.mutateAsync({ id: editingProduct.id, name: formName.trim(), brandId: formBrand, sellingPrice: parseFloat(formPrice) || 0, costPrice: parseFloat(formCostPrice) || 0, quantityAlert: parseInt(formAlert) || 0, image: formImage ?? '', quantities: buildQuantitiesPayload() });
      setEditingProduct(null); setShowEditModal(false);
    } catch (e) { setFormError(getApiErrorMessage(e)); }
  }
  async function handleArchive() {
    if (!archivingProduct) return;
    try { await archiveProduct.mutateAsync(archivingProduct.id); setArchivingProduct(null); setShowArchiveModal(false); }
    catch (e) { setFormError(getApiErrorMessage(e)); }
  }

  function handleExport() {
    const targetShops = shopFilter ? branches.filter((b) => b.id === shopFilter) : branches;
    const xlsxProducts: ProductRow[] = products.map((p, idx) => ({
      productId: idx + 1,
      productName: p.name,
      brand: p.brand?.name ?? '',
      sellingPrice: p.sellingPrice,
      quantities: Object.fromEntries(targetShops.map((b) => [b.name, qtyForBranch(p, b.id)])),
    }));
    generateRestockXlsx(xlsxProducts, targetShops, {
      filename: `products-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  }
  function handleTemplate() {
    const targetShops = shopFilter ? branches.filter((b) => b.id === shopFilter) : branches;
    const xlsxProducts: ProductRow[] = products.map((p, idx) => ({
      productId: idx + 1,
      productName: p.name,
      brand: p.brand?.name ?? '',
      sellingPrice: p.sellingPrice,
      quantities: {},
    }));
    generateRestockXlsx(xlsxProducts, targetShops, {
      filename: `restock-template-${new Date().toISOString().slice(0, 10)}.xlsx`,
      isTemplate: true,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-text-primary">Products</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowImportModal(true)} className="flex items-center gap-1 bg-btn-primary text-btn-primary-text px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition"><Upload size={14} /> Import</button>
          <button onClick={handleExport} className="flex items-center gap-1 bg-btn-primary text-btn-primary-text px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition"><Download size={14} /> Export</button>
          <button onClick={openAddModal} className="flex items-center gap-1 btn-grad px-3 py-2 rounded-lg text-sm font-medium"><Plus size={14} /> Add Product</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={shopFilter} onChange={(e) => setShopFilter(e.target.value)} className="border border-input-border rounded px-3 py-2 text-sm text-text-primary bg-input-bg focus:outline-none focus:border-input-focus min-w-[180px]">
          <option value="">All Shops</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button onClick={() => setShowRestockModal(true)} className="flex items-center gap-1 bg-btn-primary text-btn-primary-text px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition"><RefreshCw size={14} /> Restock</button>
        <button onClick={handleTemplate} className="flex items-center gap-1 btn-secondary text-text-primary px-3 py-2 rounded-lg text-sm font-medium"><FileDown size={14} /> Restock Template</button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span>Show</span>
          <select value={entriesPerPage.toString()} onChange={(e) => { const v = e.target.value; setEntriesPerPage(v === 'All' ? 'All' : parseInt(v)); setCurrentPage(1); }} className="border border-input-border rounded px-2 py-1 text-sm bg-input-bg">
            {ENTRIES_OPTIONS.map((o) => <option key={o} value={o.toString()}>{o}</option>)}
          </select>
          <span>entries</span>
        </div>
        <input type="text" placeholder="Search products..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="border border-input-border rounded px-3 py-1.5 text-sm text-text-primary bg-input-bg focus:outline-none focus:border-input-focus w-48" />
      </div>

      <div className="bg-card-bg border border-card-border rounded-lg overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-table-header">
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
              <tr><td colSpan={8} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading products...</td></tr>
            ) : isError ? (
              <tr><td colSpan={8} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
            ) : displayProducts.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-text-muted">No products found. Add one or import a CSV.</td></tr>
            ) : (
              displayProducts.map((product, i) => (
                <tr key={product.id} className="border-t border-card-border transition-colors align-top">
                  <td className="px-3 py-3 text-sm text-accent-blue font-medium">{(entriesPerPage === 'All' ? 0 : (currentPage - 1) * (entriesPerPage as number)) + i + 1}</td>
                  <td className="px-3 py-3">
                    {product.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image} alt={product.name} loading="lazy" className="w-10 h-10 rounded object-cover bg-white/10" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center text-[10px] text-text-muted">No Img</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm text-text-primary font-medium">{product.name}</td>
                  <td className="px-3 py-3 text-sm">
                    {shopFilter ? (
                      (() => {
                        const qty = qtyForBranch(product, shopFilter);
                        const isOut = qty <= 0;
                        const isLow = !isOut && product.quantityAlert > 0 && qty <= product.quantityAlert;
                        return (
                          <span className={`font-medium ${isOut ? 'text-accent-red' : isLow ? 'text-accent-orange' : 'text-text-primary'}`}>
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
                              <span className={`${isOut ? 'text-accent-red font-medium' : isLow ? 'text-accent-orange font-medium' : 'text-accent-blue'}`}>
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
                  <td className="px-3 py-3 text-sm text-text-primary">₱{product.sellingPrice.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm">
                    {product.quantityAlert > 0 ? (<span className="badge badge-neutral"><span className="badge-dot bg-accent-orange" />{product.quantityAlert}</span>) : (<span className="text-text-muted">{product.quantityAlert}</span>)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {shopFilter && <button onClick={() => setHistoryProduct(product)} className="icon-btn text-text-secondary hover:bg-white/10" title="Stock History"><ClipboardList size={16} /></button>}
                      <button onClick={() => openEditModal(product)} className="icon-btn text-accent-blue hover:bg-accent-blue/10"><Pencil size={16} /></button>
                      <button onClick={() => { setArchivingProduct(product); setFormError(null); setShowArchiveModal(true); }} className="icon-btn text-accent-red hover:bg-accent-red/10"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-text-secondary">
        <span>Showing {displayProducts.length === 0 ? 0 : ((entriesPerPage === 'All' ? 0 : (currentPage - 1) * (entriesPerPage as number)) + 1)} to {entriesPerPage === 'All' ? products.length : Math.min(currentPage * (entriesPerPage as number), products.length)} of {products.length} products</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="px-2 py-1 rounded border border-card-border disabled:opacity-50">Previous</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (<button key={p} onClick={() => setCurrentPage(p)} className={`px-2.5 py-1 rounded ${p === currentPage ? 'bg-btn-primary text-btn-primary-text' : 'border border-card-border hover:opacity-80'}`}>{p}</button>))}
            <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="px-2 py-1 rounded border border-card-border disabled:opacity-50">Next</button>
          </div>
        )}
      </div>

      {showAddModal && (
        <ProductFormModal title="Add New Product" onClose={() => setShowAddModal(false)} onSubmit={handleAdd} error={formError} buttonLabel={createProduct.isPending ? 'Saving...' : 'Save Product'} disabled={createProduct.isPending} formName={formName} setFormName={setFormName} formBrand={formBrand} setFormBrand={setFormBrand} formPrice={formPrice} setFormPrice={setFormPrice} formCostPrice={formCostPrice} setFormCostPrice={setFormCostPrice} isOwner={isOwner} formAlert={formAlert} setFormAlert={setFormAlert} formImage={formImage} setFormImage={setFormImage} isAdmin={isAdmin} formQuantities={formQuantities} setFormQuantities={setFormQuantities} branches={branchesForForm} brands={brands} />
      )}
      {showEditModal && editingProduct && (
        <ProductFormModal title="Edit Product" onClose={() => { setShowEditModal(false); setEditingProduct(null); }} onSubmit={handleEdit} error={formError} buttonLabel={updateProduct.isPending ? 'Saving...' : 'Update Product'} disabled={updateProduct.isPending} formName={formName} setFormName={setFormName} formBrand={formBrand} setFormBrand={setFormBrand} formPrice={formPrice} setFormPrice={setFormPrice} formCostPrice={formCostPrice} setFormCostPrice={setFormCostPrice} isOwner={isOwner} formAlert={formAlert} setFormAlert={setFormAlert} formImage={formImage} setFormImage={setFormImage} isAdmin={isAdmin} formQuantities={formQuantities} setFormQuantities={setFormQuantities} branches={branchesForEdit} brands={brands} />
      )}
      {showArchiveModal && archivingProduct && (
        <Modal title="Confirm Archive" onClose={() => { setShowArchiveModal(false); setArchivingProduct(null); }}>
          <div className="space-y-4">
            <p className="text-sm text-text-primary">Are you sure you want to archive <strong>{archivingProduct.name}</strong>?</p>
            {formError && <p className="text-sm text-accent-red">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowArchiveModal(false); setArchivingProduct(null); }} className="btn-secondary text-text-primary px-4 py-2 rounded text-sm font-medium">Cancel</button>
              <button onClick={handleArchive} disabled={archiveProduct.isPending} className="bg-btn-danger text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-60">{archiveProduct.isPending ? 'Archiving...' : 'Yes, Archive'}</button>
            </div>
          </div>
        </Modal>
      )}
      {showImportModal && <ImportModal branches={branches} onClose={() => setShowImportModal(false)} />}
      {showRestockModal && <RestockModal products={products} branches={branches} onClose={() => setShowRestockModal(false)} />}
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
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg" />
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
          <button onClick={onClose} className="btn-secondary text-text-primary px-4 py-2 rounded text-sm font-medium">{result ? 'Done' : 'Cancel'}</button>
          {!result && <button onClick={submit} disabled={importProducts.isPending || rows.length === 0} className="btn-grad px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">{importProducts.isPending ? 'Importing...' : `Import ${rows.length || ''}`}</button>}
        </div>
      </div>
    </Modal>
  );
}

interface RestockRow { productId: string; branchId: string; quantity: string; }

function RestockModal({ products, branches, onClose }: { products: Product[]; branches: { id: string; name: string }[]; onClose: () => void }) {
  const restock = useRestock();
  const [mode, setMode] = useState<'manual' | 'csv'>('manual');
  const [rows, setRows] = useState<RestockRow[]>([{ productId: products[0]?.id ?? '', branchId: branches[0]?.id ?? '', quantity: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RestockResult | null>(null);

  // CSV mode state
  const [csvItems, setCsvItems] = useState<RestockItem[]>([]);
  const [fileName, setFileName] = useState('');

  const setRow = (i: number, patch: Partial<RestockRow>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { productId: products[0]?.id ?? '', branchId: branches[0]?.id ?? '', quantity: '' }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const branchNameSet = new Set(branches.map((b) => b.name.toLowerCase()));
  const branchNames = branches.map((b) => b.name);

  async function onFile(file: File) {
    setError(null); setResult(null); setCsvItems([]); setFileName('');
    try {
      let headers: string[];
      let csvRows: Record<string, string>[];

      const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      if (isXlsx) {
        const buffer = await readFileAsArrayBuffer(file);
        const parsed = parseRestockXlsx(buffer, branchNames);
        headers = parsed.headers;
        csvRows = parsed.rows;
      } else {
        const text = await readFileAsText(file);
        const parsed = parseCsv(text);
        headers = parsed.headers;
        csvRows = parsed.rows;
      }

      // Accept both "Name" and "ProductName" as the product name column
      const nameCol = headers.find((h) => h.toLowerCase() === 'name' || h.toLowerCase() === 'productname') ?? null;
      if (!nameCol) {
        setError('This file does not look like a products export (missing a "Name" or "ProductName" column).');
        return;
      }

      // Match shop columns — support both plain names and slug format
      const branchColMap: { header: string; shopName: string }[] = [];
      for (const h of headers) {
        if (['productid', 'productname', 'name', 'brand', 'sellingprice', 'quantityalert'].includes(h.toLowerCase())) continue;
        if (branchNameSet.has(h.toLowerCase())) {
          const match = branches.find((b) => b.name.toLowerCase() === h.toLowerCase());
          if (match) branchColMap.push({ header: h, shopName: match.name });
        } else {
          const matched = matchSlugToShopName(h, branchNames);
          if (matched) branchColMap.push({ header: h, shopName: matched });
        }
      }

      if (branchColMap.length === 0) {
        setError('No shop columns found in the file. Use the Export button to get the correct format.');
        return;
      }
      const items: RestockItem[] = [];
      for (const r of csvRows) {
        const productName = (r[nameCol] ?? '').trim();
        if (!productName) continue;
        for (const { header, shopName } of branchColMap) {
          const qty = Number(r[header]) || 0;
          if (qty > 0) items.push({ productName, branchName: shopName, quantity: qty });
        }
      }
      setCsvItems(items);
      setFileName(file.name);
    } catch {
      setError('Could not read the file.');
    }
  }

  async function submit() {
    let items: RestockItem[];
    if (mode === 'csv') {
      items = csvItems;
      if (items.length === 0) { setError('No stock to add. Edit the shop columns in the exported file (numbers greater than 0) and re-upload.'); return; }
    } else {
      items = rows
        .filter((r) => r.productId && r.branchId && Number(r.quantity) > 0)
        .map((r) => ({ productId: r.productId, branchId: r.branchId, quantity: Number(r.quantity) }));
      if (items.length === 0) { setError('Add at least one row with a quantity greater than zero.'); return; }
    }
    setError(null);
    try { setResult(await restock.mutateAsync(items)); }
    catch (e) { setError(getApiErrorMessage(e)); }
  }

  return (
    <Modal title="Restock Products" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-1 p-1 bg-white/5 rounded-lg w-fit">
          <button onClick={() => { setMode('manual'); setError(null); setResult(null); }} className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${mode === 'manual' ? 'bg-btn-primary text-btn-primary-text' : 'text-text-secondary hover:text-text-primary'}`}>Manual</button>
          <button onClick={() => { setMode('csv'); setError(null); setResult(null); }} className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${mode === 'csv' ? 'bg-btn-primary text-btn-primary-text' : 'text-text-secondary hover:text-text-primary'}`}>Upload exported CSV</button>
        </div>

        {mode === 'manual' ? (
          <>
            <p className="text-xs text-text-muted">Add stock to products at a shop. The quantity is <strong>added</strong> to the current stock.</p>
            {products.length === 0 || branches.length === 0 ? (
              <p className="text-sm text-accent-orange">You need at least one product and one shop before restocking.</p>
            ) : (
              <div className="space-y-2">
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select value={row.productId} onChange={(e) => setRow(i, { productId: e.target.value })} className="flex-1 border border-input-border rounded px-2 py-1.5 text-sm bg-input-bg">
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select value={row.branchId} onChange={(e) => setRow(i, { branchId: e.target.value })} className="w-36 border border-input-border rounded px-2 py-1.5 text-sm bg-input-bg">
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <input type="number" min="1" placeholder="+Qty" value={row.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} className="w-20 border border-input-border rounded px-2 py-1.5 text-sm bg-input-bg" />
                    <button onClick={() => removeRow(i)} className="p-1.5 text-accent-red hover:bg-red-500/10 rounded" title="Remove"><Trash2 size={15} /></button>
                  </div>
                ))}
                <button onClick={addRow} className="flex items-center gap-1 text-sm text-accent-blue hover:underline"><Plus size={14} /> Add row</button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-text-muted">
              <strong>Export</strong> the products first, edit the shop columns so each number is the stock you want to <strong>add</strong>, then upload the edited file here. The numbers in the shop columns are <strong>added</strong> to current stock; columns/rows with 0 (or blank) are ignored.
            </p>
            <input type="file" accept=".csv,text/csv,.xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg" />
            {fileName && (
              <p className="text-sm text-text-secondary">
                Found <strong>{csvItems.length}</strong> stock addition(s) across {new Set(csvItems.map((c) => c.productName)).size} product(s) from {fileName}.
              </p>
            )}
          </>
        )}

        {error && <p className="text-sm text-accent-red">{error}</p>}
        {result && (
          <div className="rounded-lg bg-accent-green/10 border border-accent-green/30 px-3 py-2 text-sm text-text-primary">
            Restocked <strong>{result.updated}</strong> of {result.total} entries.
            {result.warnings.length > 0 && <ul className="mt-1 list-disc list-inside text-accent-orange text-xs max-h-28 overflow-y-auto">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-text-primary px-4 py-2 rounded text-sm font-medium">{result ? 'Done' : 'Cancel'}</button>
          {!result && <button onClick={submit} disabled={restock.isPending || (mode === 'csv' && csvItems.length === 0)} className="btn-grad px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">{restock.isPending ? 'Restocking...' : 'Restock'}</button>}
        </div>
      </div>
    </Modal>
  );
}

function ProductFormModal({ title, onClose, onSubmit, buttonLabel, disabled, error, formName, setFormName, formBrand, setFormBrand, formPrice, setFormPrice, formCostPrice, setFormCostPrice, isOwner, formAlert, setFormAlert, formImage, setFormImage, isAdmin, formQuantities, setFormQuantities, branches, brands }: {
  title: string; onClose: () => void; onSubmit: () => void; buttonLabel: string; disabled?: boolean; error?: string | null;
  formName: string; setFormName: (v: string) => void; formBrand: string; setFormBrand: (v: string) => void;
  formPrice: string; setFormPrice: (v: string) => void; formCostPrice: string; setFormCostPrice: (v: string) => void; isOwner: boolean; formAlert: string; setFormAlert: (v: string) => void;
  formImage: string | null; setFormImage: (v: string | null) => void; isAdmin: boolean;
  formQuantities: Record<string, string>; setFormQuantities: (v: Record<string, string>) => void;
  branches: { id: string; name: string }[]; brands: { id: string; name: string }[];
}) {
  const [imageError, setImageError] = useState<string | null>(null);

  async function handleImageFile(file: File) {
    setImageError(null);
    try {
      const dataUrl = await fileToResizedDataUrl(file, 512, 0.85);
      setFormImage(dataUrl);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'Could not process the image.');
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
          <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Image</label>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded bg-white/10 overflow-hidden flex items-center justify-center shrink-0">
              {formImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={formImage} alt="Product preview" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-text-muted">No Image</span>
              )}
            </div>
            {isAdmin ? (
              <div className="flex-1 space-y-1">
                <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])} className="w-full text-xs text-text-secondary file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-btn-primary file:text-btn-primary-text file:text-xs" />
                {formImage && (
                  <button type="button" onClick={() => { setFormImage(null); setImageError(null); }} className="text-xs text-accent-red hover:underline">Remove image</button>
                )}
                {imageError && <p className="text-xs text-accent-red">{imageError}</p>}
              </div>
            ) : (
              <p className="flex-1 text-xs text-text-muted">Only an admin can change the product image.</p>
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Quantity per shop</label>
          <div className="space-y-2">
            {branches.length === 0 && <p className="text-xs text-text-muted">No shops yet. Create a shop first.</p>}
            {branches.map((b) => (
              <div key={b.id} className="flex items-center gap-2">
                <span className="text-xs font-medium text-accent-primary bg-white/10 px-2 py-1.5 rounded min-w-[140px]">{b.name}</span>
                <input type="number" min="0" placeholder={`Quantity for ${b.name}`} value={formQuantities[b.id] ?? ''} onChange={(e) => setFormQuantities({ ...formQuantities, [b.id]: e.target.value })} className="flex-1 border border-input-border rounded px-3 py-1.5 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Brand</label>
          <select value={formBrand} onChange={(e) => setFormBrand(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus">
            <option value="">Select a brand</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {brands.length === 0 && <p className="text-xs text-text-muted mt-1">No brands yet. Create a brand first.</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Selling Price (₱)</label>
          <input type="number" step="0.01" min="0" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
        </div>
        {isOwner && (
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Cost Price (₱) <span className="text-[10px] text-accent-primary font-normal">Owner Only — Confidential</span></label>
            <input type="number" step="0.01" min="0" value={formCostPrice} onChange={(e) => setFormCostPrice(e.target.value)} placeholder="0" className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Quantity Alert</label>
          <input type="number" min="0" value={formAlert} onChange={(e) => setFormAlert(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
        </div>
        {error && <p className="text-sm text-accent-red">{error}</p>}
        <div className="flex justify-end">
          <button onClick={onSubmit} disabled={disabled} className="btn-grad px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-60">{buttonLabel}</button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card-bg border border-card-border rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text-primary">{title}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
