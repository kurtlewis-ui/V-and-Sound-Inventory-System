'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useBrands } from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { getApiErrorMessage } from '@/lib/api';
import { GridSkeleton } from '@/components/Skeleton';

export default function StaffHomePage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const branchName = useAuthStore((s) => s.user?.branch?.name);
  const { data, isLoading, isError, error } = useBrands(debouncedSearch);
  const brands = data?.data ?? [];

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div>
      {branchName && (
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1">{branchName}</p>
      )}
      <h1 className="text-2xl font-bold text-text-primary mb-4">Brands</h1>

      <div className="mb-6 flex max-w-2xl items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search brands..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input-border bg-input-bg py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
          />
        </div>
      </div>

      {isLoading ? (
        <GridSkeleton count={10} />
      ) : isError ? (
        <div className="py-16 text-center text-accent-red">{getApiErrorMessage(error)}</div>
      ) : brands.length === 0 ? (
        <div className="py-16 text-center text-text-muted">No brands found.</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {brands.map((brand) => (
            <button
              key={brand.id}
              onClick={() => router.push(`/staff/brands/${brand.id}`)}
              className="group flex flex-col overflow-hidden rounded-xl border border-card-border bg-card-bg text-left shadow-sm transition hover:border-accent-primary/50 hover:shadow-md hover:shadow-accent-primary/10"
            >
              <div className="flex aspect-square items-center justify-center bg-white/5">
                {brand.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brand.coverImage} alt={brand.name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-text-muted">No Image Available</span>
                )}
              </div>
              <div className="px-3 py-2">
                <p className="truncate text-sm font-semibold text-text-primary group-hover:text-accent-purple-light">{brand.name}</p>
                <p className="text-xs text-text-muted">{brand.productCount} product{brand.productCount === 1 ? '' : 's'}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
