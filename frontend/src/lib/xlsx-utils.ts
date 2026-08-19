/**
 * xlsx utility functions for generating and reading Excel files.
 * Requires: npm install xlsx-js-style
 */
import * as XLSX from 'xlsx-js-style';

export interface ProductRow {
  productName: string;
  brand: string;
  type: string;
  variantName: string;
  sellingPrice: number;
}

const boldStyle = { font: { bold: true } };

/**
 * Generate a plain .xlsx file for restocking.
 *
 * Per branch (1 branch): ID | ProductName | Brand | Type | Flavor/Variant | Cost | Add Quantity
 * All branches (multiple): ID | ProductName | Brand | Type | Flavor/Variant | Cost | Main Branch Add Quantity | Side Branch Add Quantity | ...
 */
export function generateRestockXlsx(
  rows: ProductRow[],
  branches: { id: string; name: string }[],
  options?: { filename?: string },
): void {
  const filename = options?.filename ?? `restock-template-${new Date().toISOString().slice(0, 10)}.xlsx`;

  const branchHeaders = branches.length === 1
    ? ['Add Quantity']
    : branches.map((b) => `${b.name} Add Quantity`);
  const headers = ['ID', 'ProductName', 'Brand', 'Type', 'Flavor/Variant', 'Selling Price', ...branchHeaders];

  const dataRows: (string | number)[][] = rows.map((row, idx) => [
    idx + 1,
    row.productName,
    row.brand,
    row.type,
    row.variantName,
    row.sellingPrice,
    ...branches.map(() => ''),
  ]);

  const wsData = [headers, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Bold headers only
  for (let col = 0; col < headers.length; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
    if (ws[cellRef]) ws[cellRef].s = boldStyle;
  }

  // Column widths
  const colWidths = [
    { wch: 5 },  // ID
    { wch: 20 }, // ProductName
    { wch: 12 }, // Brand
    { wch: 12 }, // Type
    { wch: 16 }, // Flavor/Variant
    { wch: 10 }, // Cost
    ...branches.map((b) => ({ wch: Math.max(14, b.name.length + 14) })),
  ];
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Restock');
  XLSX.writeFile(wb, filename);
}

/**
 * Parse an uploaded restock .xlsx file.
 * Supports single "Add Quantity" column or multiple "{BranchName} Add Quantity" columns.
 */
export function parseRestockXlsx(
  buffer: ArrayBuffer,
  branches?: { id: string; name: string }[],
  selectedBranchId?: string,
): { items: { productName: string; variantName: string; branchId: string; quantity: number }[] } {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { items: [] };

  const ws = wb.Sheets[sheetName];
  const rawData: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const items: { productName: string; variantName: string; branchId: string; quantity: number }[] = [];

  // Detect branch columns
  if (rawData.length === 0) return { items };
  const firstRow = rawData[0];
  const allKeys = Object.keys(firstRow);

  // Find columns that end with "Add Quantity"
  const qtyColumns: { key: string; branchId: string }[] = [];

  if (allKeys.includes('Add Quantity') && selectedBranchId) {
    // Single branch mode
    qtyColumns.push({ key: 'Add Quantity', branchId: selectedBranchId });
  } else if (branches) {
    // Multi-branch mode — match "{BranchName} Add Quantity" columns
    for (const key of allKeys) {
      if (!key.endsWith('Add Quantity')) continue;
      const branchName = key.replace(' Add Quantity', '').trim();
      const branch = branches.find((b) => b.name.toLowerCase() === branchName.toLowerCase());
      if (branch) qtyColumns.push({ key, branchId: branch.id });
    }
  }

  for (const row of rawData) {
    const productName = (row['ProductName'] || row['Name'] || '').toString().trim();
    const variantName = (row['Flavor/Variant'] || row['Flavor / Variant'] || row['Variant'] || '').toString().trim();

    if (!productName) continue;

    for (const col of qtyColumns) {
      const qty = Number(row[col.key] || 0);
      if (qty <= 0) continue;
      items.push({ productName, variantName, branchId: col.branchId, quantity: qty });
    }
  }

  return { items };
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
