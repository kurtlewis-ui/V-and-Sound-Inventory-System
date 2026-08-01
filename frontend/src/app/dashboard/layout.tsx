'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { useDraftStore } from '@/lib/draft';
import {
  LayoutDashboard,
  Store,
  Package,
  Tag,
  PhilippinePeso,
  Users,
  ClipboardList,
  Archive,
  ChevronDown,
  LogOut,
  Settings as SettingsIcon,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  dropdown?: { label: string; href: string }[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={16} /> },
  { label: 'Shops', href: '/dashboard/shops', icon: <Store size={16} /> },
  { label: 'Products', href: '/dashboard/products', icon: <Package size={16} /> },
  { label: 'Brands', href: '/dashboard/brands', icon: <Tag size={16} /> },
  {
    label: 'Sales',
    href: '/dashboard/sales',
    icon: <PhilippinePeso size={16} />,
    dropdown: [
      { label: 'Records', href: '/dashboard/sales/records' },
      { label: 'Pending', href: '/dashboard/sales/pending' },
      { label: 'Disposals', href: '/dashboard/sales/disposals' },
    ],
  },
  { label: 'User', href: '/dashboard/users', icon: <Users size={16} /> },
  { label: 'Activity Logs', href: '/dashboard/activity-logs', icon: <ClipboardList size={16} /> },
  {
    label: 'Archive',
    href: '/dashboard/archive',
    icon: <Archive size={16} />,
    dropdown: [
      { label: 'Users Archive', href: '/dashboard/archive/users' },
      { label: 'Shops Archive', href: '/dashboard/archive/shops' },
      { label: 'Products Archive', href: '/dashboard/archive/products' },
      { label: 'Brands Archive', href: '/dashboard/archive/brands' },
    ],
  },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, accessToken, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  // Close the open dropdown when clicking outside the nav or pressing Escape.
  useEffect(() => {
    if (!openDropdown) return;
    const onPointerDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDropdown(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openDropdown]);

  // Always close the dropdown when navigating to another page.
  useEffect(() => {
    setOpenDropdown(null);
  }, [pathname]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !accessToken) {
      router.replace('/login');
    } else if (mounted && user && user.role?.name === 'Staff') {
      // Staff have their own portal; keep them out of the admin dashboard.
      router.replace('/staff');
    }
  }, [mounted, accessToken, user, router]);

  function handleLogout() {
    logout();
    // Clear any leftover staff draft cart on shared devices (see staff/layout.tsx).
    useDraftStore.getState().clear();
    router.replace('/login');
  }

  const isActive = (item: NavItem) => {
    if (item.href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(item.href);
  };

  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page-bg">
        <div className="flex items-center gap-3">
          <svg className="h-6 w-6 animate-spin text-accent-primary" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-text-secondary">Loading...</p>
        </div>
      </main>
    );
  }

  if (!accessToken || (user && user.role?.name === 'Staff')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-page-bg">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-nav-bg/80 backdrop-blur-md border-b border-nav-border shadow-sm shadow-black/20">
        {/* Top bar: Logo + User */}
        <div className="flex items-center justify-between px-6 py-3">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary text-sm font-bold text-white">
              V
            </span>
            <span className="text-lg font-bold text-text-primary">Vape Shop</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/settings" className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/5 transition-colors" title="Settings">
              {user?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary text-xs font-bold text-white">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </div>
              )}
              <span className="text-sm font-medium text-text-primary hidden sm:inline">
                {user?.firstName} {user?.lastName}
              </span>
            </Link>
            <Link
              href="/dashboard/settings"
              className="flex items-center rounded-lg p-2 text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
              title="Settings"
              aria-label="Settings"
            >
              <SettingsIcon size={16} />
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 rounded-lg p-2 text-sm text-text-secondary hover:text-accent-red hover:bg-accent-red/10 transition-colors"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Navigation Bar */}
        <nav ref={navRef} className="flex flex-wrap items-center justify-center gap-1 px-6 pb-2">
          {navItems.map((item) => {
            const active = isActive(item);
            const hasDropdown = !!item.dropdown;

            return (
              <div key={item.label} className="relative">
                {hasDropdown ? (
                  <button
                    onClick={() => setOpenDropdown(openDropdown === item.label ? null : item.label)}
                    aria-haspopup="true"
                    aria-expanded={openDropdown === item.label}
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                      active
                        ? 'bg-accent-primary/15 text-accent-purple-light shadow-sm shadow-accent-primary/10'
                        : 'text-nav-text hover:text-text-primary hover:bg-white/5'
                    }`}
                  >
                    <span className="text-accent-primary">{item.icon}</span>
                    {item.label}
                    <ChevronDown size={12} />
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                      active
                        ? 'bg-accent-primary/15 text-accent-purple-light shadow-sm shadow-accent-primary/10'
                        : 'text-nav-text hover:text-text-primary hover:bg-white/5'
                    }`}
                  >
                    <span className="text-accent-primary">{item.icon}</span>
                    {item.label}
                  </Link>
                )}

                {/* Dropdown menu */}
                {hasDropdown && openDropdown === item.label && (
                  <div className="absolute top-full left-0 mt-1 bg-card-bg border border-card-border rounded-lg shadow-lg py-1 z-50 min-w-[180px]">
                    {item.dropdown!.map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className="block px-4 py-2 text-sm text-text-primary hover:bg-white/5 transition-colors"
                        onClick={() => setOpenDropdown(null)}
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </header>

      {/* Page Content */}
      <main className="px-6 py-6 max-w-[1200px] mx-auto">{children}</main>
    </div>
  );
}
