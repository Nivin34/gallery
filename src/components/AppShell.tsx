import React, { useState } from 'react';
import {
  FileText,
  FolderOpen,
  Globe,
  Images,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Shield,
  Sliders,
  Sun,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { formatPermissionLabel } from '../lib/format';

interface AppShellProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  breadcrumb: string;
  primaryAction?: React.ReactNode;
  pendingApprovalCount?: number;
  children: React.ReactNode;
}

export function AppShell({
  currentPath,
  onNavigate,
  breadcrumb,
  primaryAction,
  pendingApprovalCount = 0,
  children,
}: AppShellProps) {
  const { user, logout, apiFetch, updateUserState } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleToggleTheme = async () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    toggleTheme();
    if (user) {
      try {
        const res = await apiFetch('/api/auth/profile', {
          method: 'PATCH',
          body: JSON.stringify({ themePreference: next }),
        });
        if (res.ok) {
          const data = await res.json();
          updateUserState(data.user);
        }
      } catch {
        // Non-blocking theme sync
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    onNavigate('/login');
  };

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Note Gallery', path: '/gallery', icon: FolderOpen },
    { label: 'Collections', path: '/collections', icon: Images },
    { label: 'Notes & Blogs', path: '/notes', icon: FileText },
    { label: 'Public Gallery', path: '/public', icon: Globe },
    { label: 'Profile & Settings', path: '/settings', icon: Settings },
  ];

  const adminItems = [
    { label: 'Admin Overview', path: '/admin', icon: Shield },
    { label: 'User Management', path: '/admin/users', icon: Users },
    {
      label: 'Approval Requests',
      path: '/admin/approvals',
      icon: UserCheck,
      count: pendingApprovalCount,
    },
    { label: 'Permissions & Quotas', path: '/admin/permissions', icon: Sliders },
  ];

  const isActive = (path: string) => {
    if (path === '/notes') {
      return currentPath === '/notes' || currentPath.startsWith('/notes/');
    }
    if (path === '/public') {
      return currentPath === '/public' || currentPath.startsWith('/public/');
    }
    return currentPath === path;
  };

  const SidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white px-4 py-5 dark:bg-slate-900">
      <div>
        <button
          type="button"
          onClick={() => {
            onNavigate('/dashboard');
            setMobileOpen(false);
          }}
          className="flex w-full items-center gap-2.5 px-2 text-left"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 font-display text-sm font-bold text-white">
            FV
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
            FolioVault
          </span>
        </button>

        <nav className="mt-7 space-y-1" aria-label="Workspace Navigation">
          <div className="px-2 pb-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
            Workspace
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => {
                  onNavigate(item.path);
                  setMobileOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {user?.role === 'admin' && (
          <nav className="mt-7 space-y-1" aria-label="Administration Navigation">
            <div className="px-2 pb-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
              Administration
            </div>
            {adminItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    onNavigate(item.path);
                    setMobileOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-3 truncate">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {typeof item.count === 'number' && item.count > 0 && (
                    <span className="font-mono text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {user && (
        <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="px-2">
            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {user.name}
            </div>
            <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {user.role === 'admin' ? 'Administrator' : formatPermissionLabel(user.permissionLevel)}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#FAFAFA] text-slate-900 dark:bg-[#090D16] dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-[260px] shrink-0 border-r border-slate-200 dark:border-slate-800 lg:block">
        <div className="sticky top-0 h-screen overflow-y-auto">{SidebarContent}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-[260px] max-w-[80vw] border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close navigation menu"
            >
              <X className="h-5 w-5" />
            </button>
            {SidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="truncate text-sm font-medium text-slate-600 dark:text-slate-300">
              {breadcrumb}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleToggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {primaryAction}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
