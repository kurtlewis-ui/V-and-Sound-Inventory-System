/**
 * xlsx utility functions for generating and reading Excel files.
 * Requires: npm install xlsx-js-style
 */
import * as XLSX from 'xlsx-js-style';

export interface ProductRow {
  productName: string;
  brand: string;
  variantName: string; // empty string for simple products
  currentStock: number;
}

// Styles
const headerStyle = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
  fill: { fgColor: { rgb: '1a1a1a' } },
  alignment: { horizontal: 'center' as const },
  border: { bottom: { style: 'thin' as const, color: { rgb: '444444' } } },
};

const normalStyle = {
  font: { sz: 10 },
  alignment: { vertical: 'center' as const },
};

// Subtle light yellow for "Add Quantity" column — easy on the eyes
const addQtyStyle = {
  font: { sz: 10 },
  fill: { fgColor: { rgb: 'FEFCE8' } }, // very light warm yellow
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
};

// Subtle gray for alternating product groups (non-Add Quantity columns)
const altGroupStyle = {
  font: { sz: 10 },
  fill: { fgColor: { rgb: 'F8F8F8' } }, // barely-there gray
  alignment: { vertical: 'center' as const },
};

// Alt group + Add Quantity combined
const altGroupAddQtyStyle = {
  font: { sz: 10 },
  fill: { fgColor: { rgb: 'FEF9E7' } }, // slightly darker warm yellow for alt rows
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
};

/**
 * Generate a formatted .xlsx file for restocking.
 * Columns: ProductName | Brand | Flavor / Variant | Current Stock | Add Quantity
 */
export function generateRestockXlsx(
  rows: ProductRow[],
  options?: { filename?: string; isTemplate?: boolean },
): void {
  const filename = options?.filename ?? `restock-template-${new Date().toISOString().slice(0, 10)}.xlsx`;
  const isTemplate = options?.isTemplate ?? false;

  const headers = ['ProductName', 'Brand', 'Flavor / Variant', 'Current Stock', 'Add Quantity'];

  // Build data rows and track product grouping for alternating colors
  const dataRows: (string | number)[][] = [];
  let currentProduct = '';
  let groupIndex = 0;
  const groupIndices: number[] = []; // track which group each row belongs to

  for (const row of rows) {
    if (row.productName !== currentProduct) {
      currentProduct = row.productName;
      groupIndex++;
    }
    groupIndices.push(groupIndex);
    dataRows.push([
      row.productName,
      row.brand,
      row.variantName,
      isTemplate ? '' : row.currentStock,
      '', // Add Quantity — always blank for user to fill
    ]);
  }

  // Create worksheet
  const wsData = [headers, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Apply header styles
  for (let col = 0; col < headers.length; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
    if (ws[cellRef]) ws[cellRef].s = headerStyle;
  }

  // Apply row styles
  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const isAltGroup = groupIndices[rowIdx] % 2 === 0;
    for (let col = 0; col < headers.length; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: rowIdx + 1, c: col });
      if (!ws[cellRef]) ws[cellRef] = { v: '', t: 's' };
      if (col === 4) {
        // Add Quantity column
        ws[cellRef].s = isAltGroup ? altGroupAddQtyStyle : addQtyStyle;
      } else if (isAltGroup) {
        ws[cellRef].s = altGroupStyle;
      } else {
        ws[cellRef].s = normalStyle;
      }
    }
  }

  // Set column widths
  ws['!cols'] = [
    { wch: 22 }, // ProductName
    { wch: 14 }, // Brand
    { wch: 18 }, // Flavor / Variant
    { wch: 14 }, // Current Stock
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
 * Looks for columns: ProductName, Flavor / Variant, Add Quantity (or Quantity)
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
    // Support multiple column name variations
    const productName = (row['ProductName'] || row['Name'] || '').toString().trim();
    const variantName = (row['Flavor / Variant'] || row['Variant'] || row['Flavor'] || '').toString().trim();
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
