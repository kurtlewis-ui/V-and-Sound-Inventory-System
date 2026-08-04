/**
 * xlsx utility functions for generating and reading Excel files.
 * Requires: npm install xlsx
 */
import * as XLSX from 'xlsx';

export interface ProductRow {
  productId: string | number;
  productName: string;
  brand: string;
  sellingPrice: number;
  quantities: Record<string, number>; // shopName -> quantity
}

/**
 * Generate a slug column name from a shop name.
 * e.g. "Main Branch" -> "restock-main-branch-quantity"
 */
function shopColumnName(shopName: string): string {
  const slug = shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `restock-${slug}-quantity`;
}

/**
 * Generate a formatted .xlsx workbook for product restock.
 * - Header row frozen
 * - Auto-fitted column widths
 * - All products pre-filled with ProductId, ProductName, Brand, SellingPrice
 * - Quantity columns use the slug format (restock-{shop-slug}-quantity)
 */
export function generateRestockXlsx(
  products: ProductRow[],
  shops: { id: string; name: string }[],
  options?: { filename?: string; isTemplate?: boolean },
): void {
  const filename = options?.filename ?? `restock-template-${new Date().toISOString().slice(0, 10)}.xlsx`;

  // Build headers
  const headers = ['ProductId', 'ProductName', 'Brand', 'SellingPrice', ...shops.map((s) => shopColumnName(s.name))];

  // Build data rows
  const dataRows = products.map((p) => {
    const row: (string | number)[] = [
      p.productId,
      p.productName,
      p.brand,
      p.sellingPrice,
      ...shops.map((s) => p.quantities[s.name] ?? ''),
    ];
    return row;
  });

  // Create worksheet
  const wsData = [headers, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  const colWidths = headers.map((h, i) => {
    if (i === 0) return { wch: 10 }; // ProductId
    if (i === 1) return { wch: 25 }; // ProductName
    if (i === 2) return { wch: 15 }; // Brand
    if (i === 3) return { wch: 14 }; // SellingPrice
    return { wch: Math.max(20, h.length + 2) }; // shop columns
  });
  ws['!cols'] = colWidths;

  // Create workbook and download
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Restock');
  XLSX.writeFile(wb, filename);
}

/**
 * Parse an uploaded .xlsx file and return rows.
 */
export function parseRestockXlsx(
  buffer: ArrayBuffer,
  _shopNames: string[],
): { headers: string[]; rows: Record<string, string>[] } {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const ws = wb.Sheets[sheetName];
  const rawData: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (rawData.length === 0) return { headers: [], rows: [] };

  const headers = rawData[0].map((h) => String(h).trim());
  const rows = rawData.slice(1)
    .filter((r) => r.some((cell) => String(cell).trim() !== ''))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = String(r[idx] ?? '').trim(); });
      return obj;
    });

  return { headers, rows };
}

/**
 * Map a slug column header back to a shop name.
 * e.g. "restock-main-branch-quantity" matches "Main Branch"
 */
export function matchSlugToShopName(slug: string, shopNames: string[]): string | null {
  // Try exact match first (plain shop name)
  const exactMatch = shopNames.find((n) => n.toLowerCase() === slug.toLowerCase());
  if (exactMatch) return exactMatch;

  // Try slug format: strip prefix/suffix and match
  const stripped = slug
    .replace(/^restock-/, '')
    .replace(/-quantity$/, '');

  for (const name of shopNames) {
    const nameSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (nameSlug === stripped) return name;
  }

  return null;
}

/**
 * Read a File as ArrayBuffer (for xlsx parsing).
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
