/**
 * xlsx utility functions for generating and reading Excel files.
 * Requires: npm install xlsx-js-style
 */
import * as XLSX from 'xlsx-js-style';

export interface ProductRow {
  productName: string;
  brand: string;
  product: string; // product type: Flavor, Variant, or Cartridge
  variantName: string; // flavor/variant name, empty for simple products
  cost: number;
}

// Styles
const headerStyle = {
  font: { bold: true, sz: 11 },
  border: { bottom: { style: 'thin' as const, color: { rgb: '999999' } } },
};

// Subtle light yellow for "Add Quantity" column
const addQtyStyle = {
  fill: { fgColor: { rgb: 'FEFCE8' } },
  alignment: { horizontal: 'center' as const },
};

/**
 * Generate a formatted .xlsx file for restocking.
 * Columns: ProductName | Brand | Product | Flavor/Variant | Cost | Add Quantity
 */
export function generateRestockXlsx(
  rows: ProductRow[],
  options?: { filename?: string; isTemplate?: boolean },
): void {
  const filename = options?.filename ?? `restock-template-${new Date().toISOString().slice(0, 10)}.xlsx`;

  const headers = ['ProductName', 'Brand', 'Product', 'Flavor/Variant', 'Cost', 'Add Quantity'];

  const dataRows: (string | number)[][] = rows.map((row) => [
    row.productName,
    row.brand,
    row.product,
    row.variantName,
    row.cost,
    '', // Add Quantity — blank for user to fill
  ]);

  // Create worksheet
  const wsData = [headers, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Apply header styles
  for (let col = 0; col < headers.length; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
    if (ws[cellRef]) ws[cellRef].s = headerStyle;
  }

  // Apply subtle yellow to Add Quantity column
  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const cellRef = XLSX.utils.encode_cell({ r: rowIdx + 1, c: 5 });
    if (!ws[cellRef]) ws[cellRef] = { v: '', t: 's' };
    ws[cellRef].s = addQtyStyle;
  }

  // Set column widths
  ws['!cols'] = [
    { wch: 20 }, // ProductName
    { wch: 12 }, // Brand
    { wch: 12 }, // Product
    { wch: 16 }, // Flavor/Variant
    { wch: 10 }, // Cost
    { wch: 14 }, // Add Quantity
  ];

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  // Create workbook and download
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Restock');
  XLSX.writeFile(wb, filename);
}

/**
 * Parse an uploaded restock .xlsx file.
 * Looks for columns: ProductName, Flavor/Variant, Add Quantity
 */
export function parseRestockXlsx(
  buffer: ArrayBuffer,
): { items: { productName: string; variantName: string; quantity: number }[] } {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { items: [] };

  const ws = wb.Sheets[sheetName];
  const rawData: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const items: { productName: string; variantName: string; quantity: number }[] = [];

  for (const row of rawData) {
    const productName = (row['ProductName'] || row['Name'] || '').toString().trim();
    const variantName = (row['Flavor/Variant'] || row['Flavor / Variant'] || row['Variant'] || '').toString().trim();
    const qty = Number(row['Add Quantity'] || row['Quantity'] || 0);

    if (!productName || qty <= 0) continue;
    items.push({ productName, variantName, quantity: qty });
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
