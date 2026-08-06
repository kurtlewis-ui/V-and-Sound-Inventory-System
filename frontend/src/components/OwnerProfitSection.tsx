'use client';

import { useMemo, useState } from 'react';
import { useSalesOverview, useSalesRecords, useDisposals, useExpenses, useBranches } from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { Download } from 'lucide-react';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Owner-only Profit & Loss section on the dashboard.
 * Shows: Revenue - COGS - Expenses - Disposal Losses = Net Profit.
 * Only renders if user.role.name === 'Owner'.
 */
export function OwnerProfitSection() {
  const role = useAuthStore((s) => s.user?.role?.name);
  if (role !== 'Owner') return null;

  return <ProfitContent />;
}

function ProfitContent() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [branchId, setBranchId] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];

  // Fetch sales overview for date range
  const { data: salesData } = useSalesOverview('daily', branchId || undefined);
  const { data: salesRecordsData } = useSalesRecords({ branchId: branchId || undefined, startDate: startDate || undefined, endDate: endDate || undefined });
  const { data: disposalsData } = useDisposals({ branchId: branchId || undefined, startDate: startDate || undefined, endDate: endDate || undefined });
  const { data: expensesData } = useExpenses({ branchId: branchId || undefined, startDate: startDate || undefined, endDate: endDate || undefined });

  const salesRecords = Array.isArray(salesRecordsData?.data) ? salesRecordsData.data : [];
  const disposals = (Array.isArray(disposalsData?.data) ? disposalsData.data : []).filter((d) => d.status === 'APPROVED');
  const expenses = (Array.isArray(expensesData?.data) ? expensesData.data : []).filter((e) => e.status === 'APPROVED');

  // Calculate profit metrics with COGS
  const metrics = useMemo(() => {
    // Revenue from approved sales
    let revenue = 0;
    let cogs = 0;
    for (const sale of salesRecords) {
      if (sale.status !== 'APPROVED') continue;
      revenue += Number(sale.total);
      for (const item of sale.items ?? []) {
        // costPrice is snapshotted per sale item (confidential, Owner-only)
        const itemCost = Number(item.costPrice ?? 0);
        cogs += itemCost * item.quantity;
      }
    }

    // If no sales records with costPrice data, fall back to overview totals
    if (revenue === 0 && salesData) {
      const salesPoints = Array.isArray(salesData) ? salesData : [];
      for (const p of salesPoints) {
        if (startDate && p.date < startDate) continue;
        if (endDate && p.date > endDate) continue;
        revenue += p.total;
      }
    }

    const grossProfit = revenue - cogs;
    const expensesTotal = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const disposalLosses = disposals.reduce((sum, d) => sum + Number(d.value), 0);
    const netProfit = grossProfit - expensesTotal - disposalLosses;
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return { revenue, cogs, grossProfit, expensesTotal, disposalLosses, netProfit, margin };
  }, [salesRecords, salesData, expenses, disposals, startDate, endDate]);

  const dateLabel = startDate && endDate
    ? `${startDate} to ${endDate}`
    : startDate ? `From ${startDate}` : endDate ? `Until ${endDate}` : 'All-Time';

  async function handleExportProfit() {
    setExporting(true);
    try {
      const { exportAllData } = await import('@/lib/export-all');
      await exportAllData();
    } catch {
      // silently fail
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="bg-card-bg border border-accent-primary/30 rounded-xl p-5 shadow-sm shadow-accent-primary/10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <p className="text-xs text-accent-primary font-semibold uppercase tracking-wider">Owner Only — Confidential</p>
          <h2 className="text-lg font-bold text-text-primary">Profit & Loss ({dateLabel})</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="px-2 py-1 border border-input-border rounded text-sm bg-input-bg">
            <option value="">All Shops</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-2 py-1 border border-input-border rounded text-sm bg-input-bg" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-2 py-1 border border-input-border rounded text-sm bg-input-bg" />
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(''); setEndDate(''); }} className="px-2 py-1 text-xs text-text-secondary border border-input-border rounded hover:opacity-80">Clear</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-center">
        <div>
          <p className="text-[10px] text-text-muted uppercase">Revenue</p>
          <p className="text-lg font-bold text-accent-green">{peso(metrics.revenue)}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase">Capital</p>
          <p className="text-lg font-bold text-accent-orange">{peso(metrics.cogs)}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase">Expenses</p>
          <p className="text-lg font-bold text-accent-red">{peso(metrics.expensesTotal)}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase">Disposal Losses</p>
          <p className="text-lg font-bold text-accent-orange">{peso(metrics.disposalLosses)}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase">Net Profit</p>
          <p className={`text-lg font-bold ${metrics.netProfit >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{peso(metrics.netProfit)}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase">Margin</p>
          <p className={`text-lg font-bold ${metrics.margin >= 0 ? 'text-accent-blue' : 'text-accent-red'}`}>{metrics.margin.toFixed(1)}%</p>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-card-border flex justify-end">
        <button
          onClick={handleExportProfit}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-btn-primary text-btn-primary-text rounded-lg text-xs font-medium hover:opacity-90 transition disabled:opacity-60"
        >
          <Download size={13} /> {exporting ? 'Exporting...' : 'Export Profit Report'}
        </button>
      </div>
    </div>
  );
}
