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
  Menu,
  X,
  Settings,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  dropdown?: { label: string; href: string }[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'Shops', href: '/dashboard/shops', icon: <Store size={18} /> },
  { label: 'Products', href: '/dashboard/products', icon: <Package size={18} /> },
  { label: 'Brands', href: '/dashboard/brands', icon: <Tag size={18} /> },
  {
    label: 'Sales',
    href: '/dashboard/sales',
    icon: <PhilippinePeso size={18} />,
    dropdown: [
      { label: 'Records', href: '/dashboard/sales/records' },
      { label: 'Pending', href: '/dashboard/sales/pending' },
      { label: 'Disposals', href: '/dashboard/sales/disposals' },
    ],
  },
  { label: 'Users', href: '/dashboard/users', icon: <Users size={18} /> },
  { label: 'Activity Logs', href: '/dashboard/activity-logs', icon: <ClipboardList size={18} /> },
  {
    label: 'Archive',
    href: '/dashboard/archive',
    icon: <Archive size={18} />,
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !accessToken) {
      router.replace('/login');
    } else if (mounted && user && user.role?.name === 'Staff') {
      router.replace('/staff');
    }
  }, [mounted, accessToken, user, router]);

  function handleLogout() {
    logout();
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
          <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-text-secondary text-sm">Loading...</p>
        </div>
      </main>
    );
  }

  if (!accessToken || (user && user.role?.name === 'Staff')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-page-bg flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={navRef}
        className={`fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col bg-nav-bg border-r border-nav-border transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-nav-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white">
            <span className="text-sm font-black text-black">VS</span>
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-text-primary">Vape & Sounds</p>
            <p className="text-[10px] text-text-muted uppercase tracking-wider">EST. 2021</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = isActive(item);
            const hasDropdown = !!item.dropdown;
            const isOpen = openDropdown === item.label;

            return (
              <div key={item.label}>
                {hasDropdown ? (
                  <button
                    onClick={() => setOpenDropdown(isOpen ? null : item.label)}
                    aria-haspopup="true"
                    aria-expanded={isOpen}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                      active
                        ? 'bg-white/10 text-white'
                        : 'text-nav-text hover:text-text-primary hover:bg-white/5'
                    }`}
                  >
                    <span className={active ? 'text-white' : 'text-text-muted'}>{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                      active
                        ? 'bg-white/10 text-white'
                        : 'text-nav-text hover:text-text-primary hover:bg-white/5'
                    }`}
                  >
                    <span className={active ? 'text-white' : 'text-text-muted'}>{item.icon}</span>
                    {item.label}
                  </Link>
                )}

                {/* Dropdown sub-items */}
                {hasDropdown && isOpen && (
                  <div className="ml-9 mt-1 space-y-0.5">
                    {item.dropdown!.map((sub) => {
                      const subActive = pathname === sub.href;
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                            subActive
                              ? 'text-white bg-white/5'
                              : 'text-text-muted hover:text-text-primary hover:bg-white/5'
                          }`}
                        >
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User section at bottom */}
        <div className="border-t border-nav-border px-4 py-4">
          <div className="flex items-center gap-3">
            {user?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-white/20" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white ring-1 ring-white/20">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-[11px] text-text-muted truncate">{user?.role?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Link
              href="/dashboard/settings"
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
              title="Settings"
            >
              <Settings size={14} />
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-text-secondary hover:text-accent-red hover:bg-accent-red/10 transition-colors"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile toggle only on small screens, minimal on desktop) */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 bg-page-bg/80 backdrop-blur-md border-b border-nav-border lg:border-none">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden flex items-center rounded-lg p-2 text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
            aria-label="Toggle navigation"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          {/* Spacer for desktop — keeps layout consistent */}
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
              <span className="text-xs font-black text-black">VS</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 px-6 py-6 max-w-[1200px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
