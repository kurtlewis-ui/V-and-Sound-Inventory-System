'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Store, Package, PhilippinePeso, Users, BarChart3 } from 'lucide-react';
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
} from 'recharts';
import { useDashboardStats, useSalesOverview, useTopProducts, useBranches } from '@/lib/hooks';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];

  const [period, setPeriod] = useState('daily');
  const [overviewShop, setOverviewShop] = useState('');
  const [topShop, setTopShop] = useState('');

  const { data: overview = [], isLoading: ovLoading } = useSalesOverview(period, overviewShop || undefined);
  const { data: topProducts = [], isLoading: tpLoading } = useTopProducts(topShop || undefined);

  const v = (n?: number) => (isLoading || n === undefined ? '—' : n.toLocaleString());

  const overviewData = overview.map((p) => ({
    label: formatBucket(p.date, period),
    total: p.total,
  }));
  const topData = topProducts.map((p) => ({ name: p.name, quantity: p.quantity, revenue: p.revenue }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Overview</p>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard href="/dashboard/shops" icon={<Store size={24} />} value={v(stats?.shops)} label="Shops" />
        <StatsCard href="/dashboard/products" icon={<Package size={24} />} value={v(stats?.products)} label="Products" subtitle={`${v(stats?.brands)} brands`} />
        <StatsCard href="/dashboard/sales/pending" icon={<PhilippinePeso size={24} />} value={v(stats?.pendingSales)} label="Pending Sales" subtitle={`${v(stats?.approvedSales)} Approved`} />
        <StatsCard href="/dashboard/users" icon={<Users size={24} />} value={v(stats?.staff)} label="Staff" subtitle={`${v(stats?.admins)} Admins`} />
      </div>

      {/* Revenue Summary */}
      {stats && (
        <div className="bg-card-bg border border-card-border rounded-xl p-5 shadow-sm shadow-black/20">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-3">Revenue (All-Time Approved)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-text-secondary">Total Sales</p>
              <p className="text-2xl font-bold text-accent-green">{peso(stats.approvedSalesTotal)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Total Expenses</p>
              <p className="text-2xl font-bold text-accent-red">—</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Net Revenue</p>
              <p className="text-2xl font-bold text-text-primary">{peso(stats.approvedSalesTotal)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Sales Overview */}
      <div className="bg-card-bg border border-card-border rounded-xl p-6 shadow-sm shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-lg font-bold text-text-primary">Sales Overview</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="border border-input-border rounded px-3 py-1.5 text-sm text-text-primary bg-input-bg focus:outline-none focus:border-input-focus">
              <option value="daily">Daily (14d)</option>
              <option value="weekly">Weekly (12w)</option>
              <option value="monthly">Monthly (12m)</option>
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
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(n) => peso(Number(n))} width={70} />
              <Tooltip formatter={(val: any) => peso(Number(val))} contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }} />
              <Area type="monotone" dataKey="total" stroke="#8b5cf6" fill="url(#salesGrad)" strokeWidth={2} name="Sales" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top Products */}
      <div className="bg-card-bg border border-card-border rounded-xl p-6 shadow-sm shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-lg font-bold text-text-primary">Top 10 Best-Selling Products</h2>
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
          <ResponsiveContainer width="100%" height={Math.max(288, topData.length * 36)}>
            <BarChart data={topData} layout="vertical" margin={{ top: 0, right: 16, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} tickFormatter={(n: any) => peso(Number(n))} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} width={150} />
              <Tooltip formatter={(val: any, name: any) => [name === 'revenue' ? peso(Number(val)) : `${val} units`, name === 'revenue' ? 'Revenue' : 'Sold']} contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }} />
              <Bar dataKey="revenue" fill="#10b981" radius={[0, 4, 4, 0]} name="revenue" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function formatBucket(iso: string, period: string) {
  const d = new Date(iso);
  if (period === 'monthly') return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  if (period === 'weekly') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function StatsCard({ href, icon, value, label, subtitle }: { href: string; icon: React.ReactNode; value: string; label: string; subtitle?: string }) {
  return (
    <Link href={href} className="group bg-card-bg border border-card-border rounded-xl p-4 flex items-center gap-4 transition-colors duration-200 hover:border-accent-primary/40">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-primary/10"><span className="text-accent-primary">{icon}</span></div>
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
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-primary/10"><BarChart3 size={28} className="text-accent-primary" /></div>
      <p className="text-sm font-medium text-text-secondary">{message}</p>
    </div>
  );
}
