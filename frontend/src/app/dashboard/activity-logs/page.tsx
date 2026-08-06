'use client';

import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useActivityLogs } from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';

const categories = ['All', 'Authentications', 'Accounts', 'Shops', 'Products', 'Brands', 'Reports', 'Users'];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ActivityLogsPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [entriesPerPage, setEntriesPerPage] = useState<number | 'All'>(10);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data, isLoading, isError, error } = useActivityLogs({ search, category: activeCategory, startDate: startDate || undefined, endDate: endDate || undefined });
  const logs = data?.data ?? [];
  const displayedLogs = entriesPerPage === 'All' ? logs : logs.slice(0, entriesPerPage);

  return (
    <div className="p-6 bg-page-bg min-h-screen">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Activity Logs</h1>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              activeCategory === cat ? 'bg-btn-primary text-btn-primary-text' : 'bg-white/5 text-text-secondary hover:text-text-primary hover:bg-white/10'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Date Filter */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 border border-input-border rounded-lg text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 border border-input-border rounded-lg text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus" />
        {(startDate || endDate) && (
          <button onClick={() => { setStartDate(''); setEndDate(''); }} className="px-3 py-2 text-sm text-text-secondary border border-input-border rounded-lg hover:opacity-80 transition">Clear dates</button>
        )}
      </div>

      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm">
        <div className="p-4 flex items-center justify-between border-b border-card-border">
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">Show</label>
            <select value={entriesPerPage} onChange={(e) => setEntriesPerPage(e.target.value === 'All' ? 'All' : Number(e.target.value))} className="px-2 py-1 border border-input-border rounded text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus">
              {[5, 10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              <option value="All">All</option>
            </select>
            <span className="text-sm text-text-secondary">entries</span>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" placeholder="Search activity logs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-4 py-2 border border-input-border rounded-lg bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus w-64" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Module</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Description</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Device</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">IP Address</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading logs...</td></tr>
              ) : isError ? (
                <tr><td colSpan={8} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
              ) : displayedLogs.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center"><p className="text-accent-primary font-medium">No activity logs found</p></td></tr>
              ) : displayedLogs.map((log, idx) => (
                <tr key={log.id} className="border-b border-card-border transition">
                  <td className="px-4 py-3 text-sm text-text-primary">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{log.userName}</p>
                      <p className="text-xs text-text-muted">{log.userEmail}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary">{log.action}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{log.module}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary max-w-[220px] truncate">{log.description}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{log.device}</td>
                  <td className="px-4 py-3 text-sm text-text-muted font-mono text-xs">{log.ipAddress}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(log.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 text-sm text-text-secondary">
          Showing {displayedLogs.length} of {logs.length} logs
        </div>
      </div>
    </div>
  );
}
