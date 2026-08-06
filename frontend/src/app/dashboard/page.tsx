'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Store, Package, PhilippinePeso, Users, BarChart3, ChevronDown, ChevronUp, Recycle, Download } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useDashboardStats, useSalesOverview, useTopProducts, useBranches, useDisposals, useExpenses } from '@/lib/hooks';
import { useThemeStore } from '@/lib/theme';
import { OwnerProfitSection } from '@/components/OwnerProfitSection';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// Chart colors — monochrome for dark, colorful for light
const DONUT_COLORS_DARK = ['#ffffff', '#d4d4d4', '#a3a3a3', '#737373', '#e5e5e5', '#c0c0c0', '#f5f5f5', '#a0a0a0'];
const DONUT_COLORS_LIGHT = ['#10b981', '#34d399', '#6ee7b7', '#60a5fa', '#a78bfa', '#f59e0b', '#f87171', '#94a3b8'];

export default function DashboardPage() {
  const { contentTheme } = useThemeStore();
  const isDark = contentTheme === 'dark';
  const { data: stats, isLoading } = useDashboardStats();
  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];

  const [period, setPeriod] = useState('daily');
  const [overviewShop, setOverviewShop] = useState('');
  const [topShop, setTopShop] = useState('');
  const [disposalShop, setDisposalShop] = useState('');
  const [showAllSelling, setShowAllSelling] = useState(false);
  const [showAllDisposed, setShowAllDisposed] = useState(false);

  // Revenue date filter
  const [revenueStartDate, setRevenueStartDate] = useState('');
  const [revenueEndDate, setRevenueEndDate] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState('');

  const { data: overview = [], isLoading: ovLoading } = useSalesOverview(period, overviewShop || undefined);
  const { data: topProducts = [], isLoading: tpLoading } = useTopProducts(topShop || undefined);

  // Disposals data for "Most Disposed Products" chart
  const { data: disposalsData } = useDisposals({ branchId: disposalShop || undefined });
  const disposals = (Array.isArray(disposalsData?.data) ? disposalsData.data : []).filter((d) => d.status === 'APPROVED');

  // Expenses data for the Revenue card
  const { data: expensesData } = useExpenses({ startDate: revenueStartDate || undefined, endDate: revenueEndDate || undefined });
  const approvedExpenses = (Array.isArray(expensesData?.data) ? expensesData.data : []).filter((e) => e.status === 'APPROVED');
  const totalExpenses = approvedExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  // Disposals data for the Revenue card (all shops, date-filtered, approved only)
  const { data: revenueDisposalsData } = useDisposals({ startDate: revenueStartDate || undefined, endDate: revenueEndDate || undefined });
  const revenueDisposals = (Array.isArray(revenueDisposalsData?.data) ? revenueDisposalsData.data : []).filter((d) => d.status === 'APPROVED');
  const totalDisposals = revenueDisposals.reduce((sum, d) => sum + Number(d.value), 0);

  // Compute top disposed products (group by product name, sum quantity)
  const disposedProducts = useMemo(() => {
    const map = new Map<string, { name: string; brandName: string; quantity: number; value: number }>();
    for (const d of disposals) {
      const existing = map.get(d.name) ?? { name: d.name, brandName: d.brandName, quantity: 0, value: 0 };
      existing.quantity += d.quantity;
      existing.value += d.value;
      map.set(d.name, existing);
    }
    return [...map.values()].sort((a, b) => b.quantity - a.quantity);
  }, [disposals]);

  // Revenue filtered by date (uses sales records summary if dates are set)
  const { data: revData } = useSalesOverview('daily', undefined);
  const filteredRevenue = useMemo(() => {
    if (!revenueStartDate && !revenueEndDate) {
      return { total: stats?.approvedSalesTotal ?? 0, label: 'All-Time' };
    }
    // Filter overview data by date range
    const filtered = (revData ?? []).filter((p) => {
      if (revenueStartDate && p.date < revenueStartDate) return false;
      if (revenueEndDate && p.date > revenueEndDate) return false;
      return true;
    });
    const total = filtered.reduce((sum, p) => sum + p.total, 0);
    const label = revenueStartDate && revenueEndDate
      ? `${revenueStartDate} to ${revenueEndDate}`
      : revenueStartDate ? `From ${revenueStartDate}` : `Until ${revenueEndDate}`;
    return { total, label };
  }, [revenueStartDate, revenueEndDate, revData, stats]);

  const v = (n?: number) => (isLoading || n === undefined ? '—' : n.toLocaleString());

  const overviewData = (Array.isArray(overview) ? overview : []).map((p) => ({
    label: formatBucket(p.date, period),
    total: p.total,
  }));

  const topData = (Array.isArray(topProducts) ? topProducts : []).map((p) => ({ name: p.name, brand: p.brand, quantity: p.quantity, revenue: p.revenue }));
  const topDataPreview = topData.slice(0, 10);
  const disposedPreview = disposedProducts.slice(0, 10);
  const disposedChartData = disposedPreview.map((p) => ({ name: p.name, quantity: p.quantity }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Overview</p>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        </div>
        <button
          onClick={async () => {
            setExporting(true);
            setExportError(null);
            setExportStatus('Starting...');
            try {
              const { exportAllData } = await import('@/lib/export-all');
              await exportAllData((status) => setExportStatus(status));
              setExportStatus('');
            } catch (e: any) {
              setExportError(e?.message ?? 'Export failed');
              setExportStatus('');
            } finally {
              setExporting(false);
            }
          }}
          disabled={exporting}
          className="flex items-center gap-2 bg-btn-primary text-btn-primary-text px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-60"
        >
          <Download size={16} /> {exporting ? exportStatus || 'Exporting...' : 'Export All Data'}
        </button>
      </div>
      {exportError && (
        <div className="rounded-lg bg-accent-red/10 border border-accent-red/30 px-4 py-2 text-sm text-accent-red">{exportError}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard href="/dashboard/shops" icon={<Store size={24} />} value={v(stats?.shops)} label="Shops" accentColor="#10b981" />
        <StatsCard href="/dashboard/products" icon={<Package size={24} />} value={v(stats?.products)} label="Products" subtitle={`${v(stats?.brands)} brands`} accentColor="#60a5fa" />
        <StatsCard href="/dashboard/sales/pending" icon={<PhilippinePeso size={24} />} value={v(stats?.pendingSales)} label="Pending Sales" subtitle={`${v(stats?.approvedSales)} Approved`} accentColor="#f59e0b" />
        <StatsCard href="/dashboard/users" icon={<Users size={24} />} value={v(stats?.staff)} label="Staff" subtitle={`${v(stats?.admins)} Admins`} accentColor="#a78bfa" />
      </div>

      {/* Owner-only Profit & Loss section */}
      <OwnerProfitSection />

      {/* Revenue Summary with date picker */}
      <div className="bg-card-bg border border-card-border rounded-xl p-5 shadow-sm shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Revenue ({filteredRevenue.label})</p>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={revenueStartDate} onChange={(e) => setRevenueStartDate(e.target.value)} className="px-2 py-1 border border-input-border rounded text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus" />
            <span className="text-xs text-text-muted">to</span>
            <input type="date" value={revenueEndDate} onChange={(e) => setRevenueEndDate(e.target.value)} className="px-2 py-1 border border-input-border rounded text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus" />
            {(revenueStartDate || revenueEndDate) && (
              <button onClick={() => { setRevenueStartDate(''); setRevenueEndDate(''); }} className="px-2 py-1 text-xs text-text-secondary border border-input-border rounded hover:opacity-80">Clear</button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-xs text-text-secondary">Total Sales</p>
            <p className="text-2xl font-bold text-accent-green">{peso(filteredRevenue.total)}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary">Total Expenses</p>
            <p className="text-2xl font-bold text-accent-red">{peso(totalExpenses)}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary">Disposal Losses</p>
            <p className="text-2xl font-bold text-accent-orange">{peso(totalDisposals)}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary">Net Revenue</p>
            <p className="text-2xl font-bold text-text-primary">{peso(filteredRevenue.total - totalExpenses - totalDisposals)}</p>
          </div>
        </div>
      </div>

      {/* Sales Overview */}
      <div className="bg-card-bg border border-card-border rounded-xl p-6 shadow-sm shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-lg font-bold text-text-primary">Sales Overview</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="border border-input-border rounded px-3 py-1.5 text-sm text-text-primary bg-input-bg focus:outline-none focus:border-input-focus">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
            <select value={overviewShop} onChange={(e) => setOverviewShop(e.target.value)} className="border border-input-border rounded px-3 py-1.5 text-sm text-text-primary bg-input-bg focus:outline-none focus:border-input-focus">
              <option value="">All Shops</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
        {ovLoading ? (
          <ChartPlaceholder message="Loading..." />
        ) : overviewData.length === 0 ? (
          <ChartPlaceholder message="No approved sales in this period yet" />
        ) : (
          <ResponsiveContainer width="100%" height={288}>
            <AreaChart data={overviewData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isDark ? '#ffffff' : '#10b981'} stopOpacity={isDark ? 0.3 : 0.4} />
                  <stop offset="50%" stopColor={isDark ? '#ffffff' : '#10b981'} stopOpacity={0.1} />
                  <stop offset="95%" stopColor={isDark ? '#ffffff' : '#10b981'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: isDark ? '#666666' : '#888888' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: isDark ? '#666666' : '#888888' }} tickFormatter={(n: any) => peso(Number(n))} width={70} axisLine={false} tickLine={false} />
              <Tooltip formatter={(val: any) => peso(Number(val))} contentStyle={{ background: isDark ? 'rgba(20,20,20,0.95)' : 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)', borderRadius: 10, color: isDark ? '#f0f0f0' : '#1a1a1a', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} cursor={{ stroke: isDark ? '#ffffff' : '#10b981', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Area type="monotone" dataKey="total" stroke={isDark ? '#ffffff' : '#10b981'} fill="url(#salesGrad)" strokeWidth={2.5} name="Sales" dot={false} activeDot={{ r: 5, fill: isDark ? '#ffffff' : '#10b981', stroke: isDark ? '#0f0f0f' : '#ffffff', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top Selling Products */}
      <div className="bg-card-bg border border-card-border rounded-xl p-6 shadow-sm shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-lg font-bold text-text-primary">Top Selling Products</h2>
          <select value={topShop} onChange={(e) => setTopShop(e.target.value)} className="border border-input-border rounded px-3 py-1.5 text-sm text-text-primary bg-input-bg focus:outline-none focus:border-input-focus">
            <option value="">All Shops</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        {tpLoading ? (
          <ChartPlaceholder message="Loading..." />
        ) : topData.length === 0 ? (
          <ChartPlaceholder message="No approved sales yet" />
        ) : (
          <>
            {/* Ring/Donut chart — top 8 products by revenue */}
            <div className="flex flex-col lg:flex-row items-center gap-6">
              <div className="relative">
                <ResponsiveContainer width={260} height={260}>
                  <PieChart>
                    <Pie
                      data={topDataPreview.slice(0, 8)}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={110}
                      dataKey="revenue"
                      nameKey="name"
                      strokeWidth={2}
                      stroke={isDark ? '#0f0f0f' : '#ffffff'}
                    >
                      {topDataPreview.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={(isDark ? DONUT_COLORS_DARK : DONUT_COLORS_LIGHT)[i % 8]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: any) => peso(Number(val))} contentStyle={{ background: isDark ? 'rgba(20,20,20,0.95)' : 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)', borderRadius: 10, color: isDark ? '#f0f0f0' : '#1a1a1a', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-xs text-text-muted">Total</p>
                  <p className="text-lg font-bold text-text-primary">{peso(topData.reduce((s, p) => s + p.revenue, 0))}</p>
                </div>
              </div>
              {/* Legend */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {topDataPreview.slice(0, 8).map((p, i) => (
                  <div key={p.name} className="flex items-center gap-2.5">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ background: (isDark ? DONUT_COLORS_DARK : DONUT_COLORS_LIGHT)[i % 8] }} />
                    <div className="min-w-0">
                      <p className="text-sm text-text-primary truncate">{p.name}</p>
                      <p className="text-xs text-text-muted">{peso(p.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* View All / Show Less toggle */}
            {topData.length > 8 && (
              <button onClick={() => setShowAllSelling(!showAllSelling)} className="mt-4 flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary">
                {showAllSelling ? <><ChevronUp size={14} /> Show Less</> : <><ChevronDown size={14} /> View All ({topData.length} products)</>}
              </button>
            )}

            {/* Expanded table */}
            {showAllSelling && (
              <div className="mt-4 max-h-[400px] overflow-y-auto rounded-lg border border-card-border">
                <table className="w-full">
                  <thead className="sticky top-0 bg-table-header">
                    <tr className="text-table-header-text">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">#</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Product</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Brand</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Qty Sold</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topData.map((p, i) => (
                      <tr key={`${p.name}-${i}`} className="border-t border-card-border">
                        <td className="px-3 py-2 text-sm text-text-muted">{i + 1}</td>
                        <td className="px-3 py-2 text-sm font-medium text-text-primary">{p.name}</td>
                        <td className="px-3 py-2 text-sm text-text-secondary">{p.brand}</td>
                        <td className="px-3 py-2 text-sm text-text-primary">{p.quantity}</td>
                        <td className="px-3 py-2 text-sm font-medium text-accent-green">{peso(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Most Disposed Products */}
      <div className="bg-card-bg border border-card-border rounded-xl p-6 shadow-sm shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><Recycle size={20} /> Most Disposed Products</h2>
          <select value={disposalShop} onChange={(e) => setDisposalShop(e.target.value)} className="border border-input-border rounded px-3 py-1.5 text-sm text-text-primary bg-input-bg focus:outline-none focus:border-input-focus">
            <option value="">All Shops</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        {disposedProducts.length === 0 ? (
          <ChartPlaceholder message="No approved disposals yet" />
        ) : (
          <>
            {/* Horizontal bar chart — disposed products */}
            <ResponsiveContainer width="100%" height={Math.max(288, disposedPreview.length * 40)}>
              <BarChart data={disposedChartData} layout="vertical" margin={{ top: 0, right: 24, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: isDark ? '#666666' : '#888888' }} allowDecimals={false} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: isDark ? '#a0a0a0' : '#555555' }} width={140} axisLine={false} tickLine={false} />
                <Tooltip formatter={(val: any) => [`${val} units`, 'Disposed']} contentStyle={{ background: isDark ? 'rgba(20,20,20,0.95)' : 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(239,68,68,0.2)', borderRadius: 10, color: isDark ? '#f0f0f0' : '#1a1a1a', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} />
                <Bar dataKey="quantity" fill={isDark ? '#999999' : '#ef4444'} radius={[0, 4, 4, 0]} name="Disposed" />
              </BarChart>
            </ResponsiveContainer>

            {/* View All / Show Less toggle */}
            {disposedProducts.length > 10 && (
              <button onClick={() => setShowAllDisposed(!showAllDisposed)} className="mt-4 flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary">
                {showAllDisposed ? <><ChevronUp size={14} /> Show Less</> : <><ChevronDown size={14} /> View All ({disposedProducts.length} products)</>}
              </button>
            )}

            {/* Expanded table */}
            {showAllDisposed && (
              <div className="mt-4 max-h-[400px] overflow-y-auto rounded-lg border border-card-border">
                <table className="w-full">
                  <thead className="sticky top-0 bg-table-header">
                    <tr className="text-table-header-text">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">#</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Product</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Brand</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Qty Disposed</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Value Lost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disposedProducts.map((p, i) => (
                      <tr key={`${p.name}-${i}`} className="border-t border-card-border">
                        <td className="px-3 py-2 text-sm text-text-muted">{i + 1}</td>
                        <td className="px-3 py-2 text-sm font-medium text-text-primary">{p.name}</td>
                        <td className="px-3 py-2 text-sm text-text-secondary">{p.brandName}</td>
                        <td className="px-3 py-2 text-sm text-text-primary">{p.quantity}</td>
                        <td className="px-3 py-2 text-sm font-medium text-accent-red">{peso(p.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function formatBucket(iso: string, period: string) {
  const d = new Date(iso);
  if (period === 'yearly') return d.toLocaleDateString(undefined, { year: 'numeric' });
  if (period === 'monthly') return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  if (period === 'weekly') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function StatsCard({ href, icon, value, label, subtitle, accentColor }: { href: string; icon: React.ReactNode; value: string; label: string; subtitle?: string; accentColor?: string }) {
  return (
    <Link href={href} className="group card-hover bg-card-bg border border-card-border rounded-xl p-4 flex items-center gap-4 relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r" style={{ background: accentColor || '#10b981' }} />
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5"><span style={{ color: accentColor || '#10b981' }}>{icon}</span></div>
      <div>
        <p className="text-2xl font-bold text-text-primary leading-tight">{value}</p>
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      </div>
    </Link>
  );
}

function ChartPlaceholder({ message }: { message: string }) {
  return (
    <div className="h-72 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-card-border text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-teal/10"><BarChart3 size={28} className="text-accent-teal" /></div>
      <p className="text-sm font-medium text-text-secondary">{message}</p>
    </div>
  );
}
