'use client';

import { Fragment, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useSalesRecords, useBranches } from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';
import type { PaymentMethod } from '@/lib/types';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function paymentDotColor(pm: PaymentMethod) {
  return pm === 'Cash' ? 'bg-accent-green' : pm === 'Gcash' ? 'bg-accent-blue' : 'bg-accent-purple-light';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function SalesRecordsPage() {
  const [search, setSearch] = useState('');
  const [selectedShop, setSelectedShop] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];

  const { data, isLoading, isError, error } = useSalesRecords({
    search,
    branchId: selectedShop || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const sales = data?.data ?? [];
  const summary = data?.summary ?? { cash: 0, gcash: 0, bankTransfer: 0, total: 0, count: 0 };

  const clearFilters = () => {
    setSelectedShop('');
    setStartDate('');
    setEndDate('');
    setSearch('');
  };

  return (
    <div className="p-6 bg-page-bg min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Sales Records</h1>
        <button onClick={clearFilters} className="px-4 py-2 border border-input-border rounded-lg text-sm text-text-primary hover:bg-white/5 transition">
          Clear Filter
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm mb-4">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <select value={selectedShop} onChange={(e) => setSelectedShop(e.target.value)} className="px-3 py-2 border border-input-border rounded-lg text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus">
            <option value="">All Shops</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 border border-input-border rounded-lg text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 border border-input-border rounded-lg text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm">
        <div className="p-4 border-b border-card-border">
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" placeholder="Search records..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-input-border rounded-lg bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Sale</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Quantity</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Selling Price</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Sub Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Staff</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading records...</td></tr>
              ) : isError ? (
                <tr><td colSpan={9} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-text-muted">No sales records found.</td></tr>
              ) : sales.map((sale) => (
                <Fragment key={sale.id}>
                  {sale.items.map((item, idx) => (
                    <tr key={item.id} className="border-b border-card-border hover:bg-white/5 transition">
                      <td className="px-4 py-3 text-sm text-text-primary font-medium">{idx === 0 ? `#${sale.number}` : ''}</td>
                      <td className="px-4 py-3 text-sm text-text-primary">{item.name}</td>
                      <td className="px-4 py-3 text-sm text-text-primary">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{item.brandName}</td>
                      <td className="px-4 py-3 text-sm text-text-primary">{peso(item.unitPrice)}</td>
                      <td className="px-4 py-3 text-sm text-text-primary font-medium">{peso(item.subTotal)}</td>
                      <td className="px-4 py-3">
                        <span className="badge badge-neutral">
                          <span className={`badge-dot ${paymentDotColor(sale.paymentMethod)}`} />
                          {sale.paymentMethod === 'BankTransfer' ? `Bank Transfer${sale.bankNote ? ` (${sale.bankNote})` : ''}` : sale.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{sale.staff?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(sale.createdAt)}</td>
                    </tr>
                  ))}
                  <tr className="bg-accent-orange/10 border-b border-card-border">
                    <td colSpan={9} className="px-4 py-2 text-sm font-semibold text-accent-orange">
                      Total for Sale #{sale.number}{sale.branch ? ` (${sale.branch.name})` : ''}: {peso(sale.total)}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="p-4 border-t border-card-border">
          <div className="border-l-4 border-accent-blue pl-4 space-y-1">
            <p className="text-sm text-text-primary"><span className="font-medium">Total for Cash:</span> {peso(summary.cash)}</p>
            <p className="text-sm text-text-primary"><span className="font-medium">Total for Gcash:</span> {peso(summary.gcash)}</p>
            <p className="text-sm text-text-primary"><span className="font-medium">Total for Bank Transfer:</span> {peso(summary.bankTransfer)}</p>
            <p className="text-sm text-text-primary font-bold">Total for All Sales: {peso(summary.total)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
