'use client';

import { useMemo, useState } from 'react';
import { useSalesRecords, useDisposals, useExpenses, useBranches } from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { Download, TrendingUp } from 'lucide-react';
import { Select } from '@/components/Select';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Merged financial section for the owner dashboard — replaces the old separate
 * "Profit & Loss" (owner-only) card and the "Revenue Summary" card, which
 * overlapped and each fetched sales/expenses/disposals independently.
 *
 * ONE shared date range + shop filter drives a single set of fetches. Owners
 * see the full P&L (Revenue, Capital/COGS, Expenses, Disposal Losses, Net
 * Profit, Margin). Admins see the revenue-level rollup only (no confidential
 * COGS / margin). Visible to Owner and Admin (Staff never reach this page).
 */
export function FinancialOverview() {
  const role = useAuthStore((s) => s.user?.role?.name);
  const isOwner = role === 'Owner';

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [branchId, setBranchId] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];

  const { data: salesRecordsData, isLoading: srLoading } = useSalesRecords({
    branchId: branchId || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });
  const { data: disposalsData, isLoading: dpLoading } = useDisposals({
    branchId: branchId || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });
  const { data: expensesData, isLoading: exLoading } = useExpenses({
    branchId: branchId || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const loading = srLoading || dpLoading || exLoading;

  const salesRecords = Array.isArray(salesRecordsData?.data) ? salesRecordsData.data : [];
  const disposals = (Array.isArray(disposalsData?.data) ? disposalsData.data : []).filter((d) => d.status === 'APPROVED');
  const expenses = (Array.isArray(expensesData?.data) ? expensesData.data : []).filter((e) => e.status === 'APPROVED');

  const metrics = useMemo(() => {
    // Revenue + COGS from approved sales records (single source of truth — no
    // fragile ISO-vs-YYYY-MM-DD date compare; the server already filters by the
    // date range we pass in).
    let revenue = 0;
    let cogs = 0;
    for (const sale of salesRecords) {
      if (sale.status !== 'APPROVED') continue;
      revenue += Number(sale.total);
      for (const item of sale.items ?? []) {
        const itemCost = Number(item.costPrice ?? 0);
        cogs += itemCost * item.quantity;
      }
    }

    const grossProfit = revenue - cogs;
    const expensesTotal = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const disposalLosses = disposals.reduce((sum, d) => sum + Number(d.value), 0);
    const netProfit = grossProfit - expensesTotal - disposalLosses;
    // Non-owner "Net Revenue" excludes COGS (they don't see cost data).
    const netRevenue = revenue - expensesTotal - disposalLosses;
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return { revenue, cogs, grossProfit, expensesTotal, disposalLosses, netProfit, netRevenue, margin };
  }, [salesRecords, expenses, disposals]);

  const dateLabel = startDate && endDate
    ? `${startDate} to ${endDate}`
    : startDate ? `From ${startDate}` : endDate ? `Until ${endDate}` : 'All-Time';

  async function handleExport() {
    setExporting(true);
    try {
      const { exportAllData } = await import('@/lib/export-all');
      await exportAllData();
    } catch {
      // silently fail — the main dashboard export surfaces errors
    } finally {
      setExporting(false);
    }
  }

  // Metric tiles differ by role: owners get the confidential COGS + margin.
  const tiles = isOwner
    ? [
        { label: 'Revenue', value: peso(metrics.revenue), tone: 'text-accent-green' },
        { label: 'Capital', value: peso(metrics.cogs), tone: 'text-accent-orange' },
        { label: 'Expenses', value: peso(metrics.expensesTotal), tone: 'text-accent-red' },
        { label: 'Disposal Losses', value: peso(metrics.disposalLosses), tone: 'text-accent-orange' },
        { label: 'Net Profit', value: peso(metrics.netProfit), tone: metrics.netProfit >= 0 ? 'text-accent-green' : 'text-accent-red' },
        { label: 'Margin', value: `${metrics.margin.toFixed(1)}%`, tone: metrics.margin >= 0 ? 'text-accent-blue' : 'text-accent-red' },
      ]
    : [
        { label: 'Total Sales', value: peso(metrics.revenue), tone: 'text-accent-green' },
        { label: 'Total Expenses', value: peso(metrics.expensesTotal), tone: 'text-accent-red' },
        { label: 'Disposal Losses', value: peso(metrics.disposalLosses), tone: 'text-accent-orange' },
        { label: 'Net Revenue', value: peso(metrics.netRevenue), tone: metrics.netRevenue >= 0 ? 'text-text-primary' : 'text-accent-red' },
      ];

  return (
    <div className="glass rounded-2xl p-5 elevate">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-accent-green/10 text-accent-green shrink-0">
            <TrendingUp size={20} />
          </div>
          <div>
            <p className="text-xs text-text-secondary font-semibold uppercase tracking-wider">Financial Overview</p>
            <h2 className="text-lg font-bold text-text-primary">
              {isOwner ? 'Profit & Loss' : 'Revenue'} <span className="text-text-muted font-normal">({dateLabel})</span>
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={branchId}
            onChange={setBranchId}
            options={[{ value: '', label: 'All Shops' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
            className="min-w-[150px]"
            ariaLabel="Shop"
          />
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="glass-select rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none" aria-label="Start date" />
          <span className="text-xs text-text-muted">to</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="glass-select rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none" aria-label="End date" />
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(''); setEndDate(''); }} className="px-3 py-2 text-xs text-text-secondary rounded-lg border border-input-border hover:opacity-80">Clear</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className={`grid grid-cols-2 ${isOwner ? 'sm:grid-cols-6' : 'sm:grid-cols-4'} gap-3`}>
          {tiles.map((_, i) => (
            <div key={i} className="rounded-xl border border-card-border bg-white/[0.03] p-3">
              <div className="h-2.5 w-12 rounded bg-white/10 mb-2" />
              <div className="h-5 w-20 rounded bg-white/10" />
            </div>
          ))}
        </div>
      ) : (
        <div className={`grid grid-cols-2 ${isOwner ? 'sm:grid-cols-6' : 'sm:grid-cols-4'} gap-3`}>
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border border-card-border bg-white/[0.03] p-3 text-center transition-colors hover:bg-white/[0.05]">
              <p className="text-[10px] text-text-muted uppercase tracking-wide">{t.label}</p>
              <p className={`mt-1 text-lg font-bold font-mono ${t.tone}`}>{t.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-card-border flex justify-end">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="btn-grad flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs disabled:opacity-60"
        >
          <Download size={13} /> {exporting ? 'Exporting…' : isOwner ? 'Export Profit Report' : 'Export Report'}
        </button>
      </div>
    </div>
  );
}
