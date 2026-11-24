import React, { useCallback, useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { AppShell } from './components/AppShell';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import {
  AdminApprovalsPage,
  AdminOverviewPage,
  AdminPermissionsPage,
  AdminUsersPage,
} from './pages/AdminPages';
import {
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  SignUpPage,
} from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { GalleryPage } from './pages/GalleryPage';
import { NotesPage } from './pages/NotesPage';
import { PublicGalleryPage } from './pages/PublicGalleryPage';
import { SettingsPage } from './pages/SettingsPage';

function AppRouter() {
  const { user, apiFetch } = useAuth();
  const [locationPath, setLocationPath] = useState(() => window.location.pathname + window.location.search);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const onPopState = () => {
      setLocationPath(window.location.pathname + window.location.search);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((target: string, state?: unknown) => {
    window.history.pushState(state ?? {}, '', target);
    setLocationPath(target);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') {
      apiFetch('/api/admin/stats')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && typeof d.pendingUsers === 'number') {
            setPendingCount(d.pendingUsers);
          }
        })
        .catch(() => {});
    }
  }, [user?.role, apiFetch]);

  const [pathname, searchStr] = locationPath.split('?');
  const searchParams = new URLSearchParams(searchStr || '');

  // Public routes accessible without signing in
  if (pathname === '/public') {
    if (user) {
      return (
        <AppShell
          currentPath={pathname}
          onNavigate={navigate}
          breadcrumb="Workspace / Public Gallery"
          pendingApprovalCount={pendingCount}
        >
          <PublicGalleryPage onNavigate={navigate} />
        </AppShell>
      );
    }
    return <PublicGalleryPage onNavigate={navigate} />;
  }

  if (pathname.startsWith('/public/file/')) {
    const slug = pathname.replace('/public/file/', '').trim();
    if (user) {
      return (
        <AppShell
          currentPath="/public"
          onNavigate={navigate}
          breadcrumb="Workspace / Public Gallery / Shared File"
          pendingApprovalCount={pendingCount}
        >
          <PublicGalleryPage shareKind="file" shareSlug={slug} onNavigate={navigate} />
        </AppShell>
      );
    }
    return <PublicGalleryPage shareKind="file" shareSlug={slug} onNavigate={navigate} />;
  }

  if (pathname.startsWith('/public/note/')) {
    const slug = pathname.replace('/public/note/', '').trim();
    if (user) {
      return (
        <AppShell
          currentPath="/public"
          onNavigate={navigate}
          breadcrumb="Workspace / Public Gallery / Shared Note"
          pendingApprovalCount={pendingCount}
        >
          <PublicGalleryPage shareKind="note" shareSlug={slug} onNavigate={navigate} />
        </AppShell>
      );
    }
    return <PublicGalleryPage shareKind="note" shareSlug={slug} onNavigate={navigate} />;
  }

  // Auth routes
  if (!user) {
    if (pathname === '/signup') return <SignUpPage onNavigate={navigate} />;
    if (pathname === '/forgot-password') return <ForgotPasswordPage onNavigate={navigate} />;
    if (pathname === '/reset-password') {
      return (
        <ResetPasswordPage
          initialToken={searchParams.get('token') || ''}
          onNavigate={navigate}
        />
      );
    }
    return <LoginPage onNavigate={navigate} />;
  }

  // Redirect auth paths when already signed in
  const activePath =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password'
      ? '/dashboard'
      : pathname;

  const isAdminRoute = activePath.startsWith('/admin');
  if (isAdminRoute && user.role !== 'admin') {
    return (
      <AppShell
        currentPath="/dashboard"
        onNavigate={navigate}
        breadcrumb="Workspace / Dashboard"
      >
        <DashboardPage onNavigate={navigate} />
      </AppShell>
    );
  }

  let breadcrumb = 'Workspace / Dashboard';
  let pageContent: React.ReactNode = <DashboardPage onNavigate={navigate} />;

  if (activePath === '/gallery') {
    breadcrumb = 'Workspace / Note Gallery';
    pageContent = <GalleryPage onNavigate={navigate} />;
  } else if (activePath === '/collections') {
    breadcrumb = 'Workspace / Image Collections';
    pageContent = <NotesPage initialKindFilter="collections" onNavigate={navigate} />;
  } else if (activePath === '/notes') {
    breadcrumb = 'Workspace / Notes & Blogs';
    pageContent = <NotesPage onNavigate={navigate} />;
  } else if (activePath === '/notes/new') {
    breadcrumb = 'Workspace / Notes & Blogs / New Note';
    pageContent = <NotesPage noteIdParam="new" onNavigate={navigate} />;
  } else if (activePath.startsWith('/notes/')) {
    const id = activePath.replace('/notes/', '').trim();
    breadcrumb = 'Workspace / Notes & Blogs / Editor';
    pageContent = <NotesPage noteIdParam={id} onNavigate={navigate} />;
  } else if (activePath === '/settings') {
    breadcrumb = 'Workspace / Profile & Settings';
    pageContent = <SettingsPage />;
  } else if (activePath === '/admin') {
    breadcrumb = 'Administration / Overview';
    pageContent = (
      <AdminOverviewPage onNavigate={navigate} onPendingUpdated={setPendingCount} />
    );
  } else if (activePath === '/admin/users') {
    breadcrumb = 'Administration / User Management';
    pageContent = <AdminUsersPage />;
  } else if (activePath === '/admin/approvals') {
    breadcrumb = 'Administration / Registration Approvals';
    pageContent = <AdminApprovalsPage onPendingUpdated={setPendingCount} />;
  } else if (activePath === '/admin/permissions') {
    breadcrumb = 'Administration / Permissions & Storage';
    pageContent = <AdminPermissionsPage />;
  }

  return (
    <AppShell
      currentPath={activePath}
      onNavigate={navigate}
      breadcrumb={breadcrumb}
      pendingApprovalCount={pendingCount}
    >
      {pageContent}
    </AppShell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRouter />
        <Toaster richColors position="bottom-right" />
      </AuthProvider>
    </ThemeProvider>
  );
}
