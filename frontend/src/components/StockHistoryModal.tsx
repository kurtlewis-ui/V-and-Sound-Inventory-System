'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useStockMovements } from '@/lib/hooks';
import type { StockMovementType } from '@/lib/types';

function typeLabel(type: StockMovementType): string {
  switch (type) {
    case 'SALE': return 'Added orders.';
    case 'RESTOCK': return 'Restocked product.';
    case 'DISPOSAL': return 'Disposed product.';
    case 'RETURN': return 'Restored product quantity after clearing orders.';
    case 'ADJUSTMENT': return 'Updated quantity.';
    default: return type;
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

interface Props {
  productId: string;
  productName: string;
  branchId: string;
  branchName: string;
  onClose: () => void;
}

export function StockHistoryModal({ productId, productName, branchId, branchName, onClose }: Props) {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useStockMovements({ productId, branchId, page, limit: 50 });
  const movements = Array.isArray(data?.data) ? data.data : [];
  const pagination = data?.pagination;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card-bg border border-card-border rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-card-border shrink-0">
          <div>
            <h3 className="text-lg font-bold text-text-primary">Product Activity Logs — {productName}</h3>
            <p className="text-xs text-text-muted mt-0.5">{branchName}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="py-10 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading history...</div>
          ) : movements.length === 0 ? (
            <div className="py-10 text-center text-text-muted">No stock movements recorded for this product at this branch.</div>
          ) : (
            <div className="space-y-3">
              {movements.map((m) => (
                <div key={m.id} className="border-b border-card-border pb-3 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-text-primary">{m.user ?? 'System'}</p>
                    <p className="text-xs text-text-muted whitespace-nowrap">{formatDateTime(m.createdAt)}</p>
                  </div>
                  <p className="text-sm text-text-secondary mt-0.5">{m.description || typeLabel(m.type)}</p>
                  <p className="text-sm mt-0.5">
                    <span className="text-text-secondary">Remaining Quantity: </span>
                    <span className="font-medium text-text-primary">{m.quantityAfter}</span>
                    {' '}
                    <span className={`font-medium ${m.quantityChange > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      ({m.quantityChange > 0 ? '+' : ''}{m.quantityChange})
                    </span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-3 border-t border-card-border shrink-0">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!pagination.hasPrev} className="px-3 py-1 text-sm text-text-secondary rounded border border-card-border disabled:opacity-40">Previous</button>
            <span className="text-sm text-text-muted">Page {pagination.page} of {pagination.totalPages}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={!pagination.hasNext} className="px-3 py-1 text-sm text-text-secondary rounded border border-card-border disabled:opacity-40">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
