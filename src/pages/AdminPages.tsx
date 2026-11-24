import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  KeyRound,
  Lock,
  Save,
  Search,
  Shield,
  Trash2,
  Unlock,
  UserCheck,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { formatBytes, formatDate, formatPermissionLabel } from '../lib/format';
import type {
  AdminStatsDTO,
  GalleryFileDTO,
  NoteDTO,
  PaginatedResponse,
  PasswordResetRequestDTO,
  PermissionLevel,
  UserDTO,
  UserRole,
  Visibility,
} from '../types';

export function AdminOverviewPage({
  onNavigate,
  onPendingUpdated,
}: {
  onNavigate: (path: string) => void;
  onPendingUpdated?: (count: number) => void;
}) {
  const { apiFetch } = useAuth();
  const [stats, setStats] = useState<AdminStatsDTO | null>(null);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequestDTO[]>([]);
  const [generatedResetLink, setGeneratedResetLink] = useState<{
    email: string;
    url: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, reqRes] = await Promise.all([
        apiFetch('/api/admin/stats'),
        apiFetch('/api/admin/reset-requests'),
      ]);
      if (statsRes.ok) {
        const s: AdminStatsDTO = await statsRes.json();
        setStats(s);
        onPendingUpdated?.(s.pendingUsers);
      }
      if (reqRes.ok) {
        const r = await reqRes.json();
        setResetRequests(r.requests || []);
      }
    } catch {
      toast.error('Unable to load administrator statistics.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, onPendingUpdated]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleIssueReset = async (reqItem: PasswordResetRequestDTO) => {
    try {
      const res = await apiFetch(`/api/admin/users/${reqItem.userId}/reset-token`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not generate reset token.');
        return;
      }
      const url = `${window.location.origin}/reset-password?token=${encodeURIComponent(data.resetToken)}`;
      setGeneratedResetLink({ email: reqItem.userEmail, url });
      toast.success(`Reset token generated for ${reqItem.userName}.`);
      loadData();
    } catch {
      toast.error('Network error generating reset token.');
    }
  };

  if (loading || !stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Admin Control Center
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Platform governance, storage telemetry, registration queue, and access control.
          </p>
        </div>

        <div className="text-right text-xs text-slate-500 dark:text-slate-400">
          <div>
            Persistence:{' '}
            <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
              {stats.databaseEngine === 'mongodb' ? 'MongoDB (Mongoose)' : 'Local Document Store'}
            </span>
          </div>
          {stats.databaseFallbackReason && (
            <div className="mt-1 max-w-md text-[11px] text-amber-700 dark:text-amber-400">
              {stats.databaseFallbackReason}
            </div>
          )}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Users</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">{stats.totalUsers}</div>
          <div className="mt-1 text-xs text-slate-500">
            {stats.approvedUsers} approved · {stats.deactivatedUsers} deactivated
          </div>
        </div>

        <div
          onClick={() => onNavigate('/admin/approvals')}
          className="cursor-pointer rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800"
        >
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Pending Approvals</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
            {stats.pendingUsers}
          </div>
          <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">Review queue →</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Stored Files</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">{stats.totalFiles}</div>
          <div className="mt-1 text-xs text-slate-500">
            {stats.publicFiles} public · {stats.privateFiles} private
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Platform Storage</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
            {formatBytes(stats.totalStorageBytes)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {stats.totalNotes} notes ({stats.publishedNotes} published)
          </div>
        </div>
      </div>

      {/* Category Breakdown & Reset Requests */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            Object Storage Breakdown
          </h2>
          <div className="mt-4 space-y-3">
            {(['image', 'document', 'spreadsheet', 'other'] as const).map((cat) => {
              const info = stats.storageByCategory[cat];
              const pct =
                stats.totalStorageBytes > 0
                  ? Math.round((info.bytes / stats.totalStorageBytes) * 100)
                  : 0;
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium capitalize text-slate-700 dark:text-slate-300">
                      {cat === 'other' ? 'Other Formats' : `${cat}s`}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {info.count} files · {formatBytes(info.bytes)} ({pct}%)
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Password Reset Requests
            </h2>
            <span className="font-mono text-xs tabular-nums text-slate-500">
              {resetRequests.length} pending
            </span>
          </div>

          {generatedResetLink && (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs dark:border-blue-900/60 dark:bg-blue-950/40">
              <div className="font-medium text-blue-900 dark:text-blue-200">
                Single-use reset link for {generatedResetLink.email}:
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <code className="truncate font-mono text-[11px] text-blue-800 dark:text-blue-300">
                  {generatedResetLink.url}
                </code>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(generatedResetLink.url);
                    toast.success('Reset link copied.');
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white"
                >
                  <Copy className="h-3 w-3" />
                  <span>Copy</span>
                </button>
              </div>
            </div>
          )}

          {resetRequests.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
              No pending admin-assisted password reset requests.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {resetRequests.map((reqItem) => (
                <div key={reqItem.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {reqItem.userName}
                    </div>
                    <div className="truncate text-xs text-slate-500">{reqItem.userEmail}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleIssueReset(reqItem)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    <span>Issue Reset Link</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function AdminUsersPage() {
  const { user: currentUser, apiFetch } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [role, setRole] = useState('all');
  const [active, setActive] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResponse<UserDTO> | null>(null);
  const [loading, setLoading] = useState(true);

  const [userToDelete, setUserToDelete] = useState<UserDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [issuedResetUrl, setIssuedResetUrl] = useState<{ email: string; url: string } | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '12',
        status,
        role,
        active,
      });
      if (search.trim()) params.set('search', search.trim());
      const res = await apiFetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) setData(await res.json());
    } catch {
      toast.error('Unable to load user directory.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, page, status, role, active, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (target: UserDTO, nextRole: UserRole) => {
    const res = await apiFetch(`/api/admin/users/${target.id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: nextRole }),
    });
    const d = await res.json();
    if (!res.ok) {
      toast.error(d.error || 'Could not update role.');
      return;
    }
    toast.success(`${target.name} is now ${nextRole}.`);
    loadUsers();
  };

  const handleToggleActive = async (target: UserDTO) => {
    const res = await apiFetch(`/api/admin/users/${target.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !target.isActive }),
    });
    const d = await res.json();
    if (!res.ok) {
      toast.error(d.error || 'Could not update account status.');
      return;
    }
    toast.success(target.isActive ? 'Account deactivated.' : 'Account activated.');
    loadUsers();
  };

  const handleGenerateReset = async (target: UserDTO) => {
    const res = await apiFetch(`/api/admin/users/${target.id}/reset-token`, {
      method: 'POST',
    });
    const d = await res.json();
    if (!res.ok) {
      toast.error(d.error || 'Could not generate reset token.');
      return;
    }
    const url = `${window.location.origin}/reset-password?token=${encodeURIComponent(d.resetToken)}`;
    setIssuedResetUrl({ email: target.email, url });
    toast.success('Single-use reset link generated.');
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/admin/users/${userToDelete.id}`, {
        method: 'DELETE',
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || 'Could not delete user.');
        return;
      }
      toast.success('User and associated content removed.');
      setUserToDelete(null);
      loadUsers();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          User Management
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage user roles, account activation, password recovery links, and account removal.
        </p>
      </div>

      {issuedResetUrl && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs dark:border-blue-900/60 dark:bg-blue-950/40">
          <div className="min-w-0">
            <span className="font-semibold text-blue-900 dark:text-blue-200">
              Reset link for {issuedResetUrl.email}:
            </span>{' '}
            <code className="break-all font-mono text-blue-800 dark:text-blue-300">
              {issuedResetUrl.url}
            </code>
          </div>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(issuedResetUrl.url);
              toast.success('Reset link copied.');
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Copy Link</span>
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-12">
        <div className="relative sm:col-span-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or email..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
        <div className="sm:col-span-2">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="all">All Status</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="user">Normal User</option>
          </select>
        </div>
        <div className="sm:col-span-3">
          <select
            value={active}
            onChange={(e) => {
              setActive(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="all">All Account States</option>
            <option value="active">Active Only</option>
            <option value="inactive">Deactivated Only</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Approval</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3 text-right">Files / Notes</th>
              <th className="px-4 py-3 text-right">Storage</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                  Loading users...
                </td>
              </tr>
            ) : !data || data.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                  No users match your filters.
                </td>
              </tr>
            ) : (
              data.items.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{u.name}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        disabled={isSelf}
                        onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
                      >
                        <option value="user">Normal User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs capitalize">
                      <span
                        className={
                          u.status === 'approved'
                            ? 'font-medium text-emerald-600 dark:text-emerald-400'
                            : u.status === 'pending'
                              ? 'font-medium text-amber-600 dark:text-amber-400'
                              : 'font-medium text-red-600 dark:text-red-400'
                        }
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <button
                        type="button"
                        disabled={isSelf}
                        onClick={() => handleToggleActive(u)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                          u.isActive
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
                        }`}
                      >
                        {u.isActive ? 'Active' : 'Deactivated'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                      {u.fileCount} / {u.noteCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                      {formatBytes(u.usedStorageBytes)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleGenerateReset(u)}
                          title="Generate password reset link"
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        {!isSelf && (
                          <button
                            type="button"
                            onClick={() => setUserToDelete(u)}
                            title="Delete user"
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-mono tabular-nums">
            Page {data.page} of {data.totalPages} ({data.total} users)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40 dark:border-slate-700"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40 dark:border-slate-700"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(userToDelete)}
        title="Remove User Account"
        description={`Permanently delete ${userToDelete?.name} (${userToDelete?.email}) and all of their uploaded files and notes?`}
        confirmLabel="Remove User"
        destructive
        loading={deleting}
        onCancel={() => setUserToDelete(null)}
        onConfirm={handleDeleteUser}
      />
    </div>
  );
}

export function AdminApprovalsPage({
  onPendingUpdated,
}: {
  onPendingUpdated?: (count: number) => void;
}) {
  const { apiFetch } = useAuth();
  const [pendingUsers, setPendingUsers] = useState<UserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [tierMap, setTierMap] = useState<Record<string, PermissionLevel>>({});
  const [publicMap, setPublicMap] = useState<Record<string, boolean>>({});
  const [rejectTarget, setRejectTarget] = useState<UserDTO | null>(null);
  const [processing, setProcessing] = useState(false);

  const loadPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/users?status=pending&limit=50');
      if (res.ok) {
        const data: PaginatedResponse<UserDTO> = await res.json();
        setPendingUsers(data.items);
        onPendingUpdated?.(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch, onPendingUpdated]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const handleDecision = async (u: UserDTO, decision: 'approved' | 'rejected') => {
    setProcessing(true);
    try {
      const res = await apiFetch(`/api/admin/users/${u.id}/approval`, {
        method: 'PATCH',
        body: JSON.stringify({
          decision,
          permissionLevel: tierMap[u.id] || 'view_edit_delete',
          canPublishPublic: publicMap[u.id] ?? true,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || 'Action failed.');
        return;
      }
      toast.success(decision === 'approved' ? `${u.name} approved.` : `${u.name} rejected.`);
      setRejectTarget(null);
      await loadPending();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Registration Approval Requests
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Review pending user sign-ups and assign initial permission tiers before granting access.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      ) : pendingUsers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <UserCheck className="mx-auto h-10 w-10 text-emerald-500" />
          <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Approval queue is clear
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            All user registration requests have been reviewed.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingUsers.map((u) => (
            <div
              key={u.id}
              className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{u.name}</h3>
                  <span className="text-xs text-slate-500">
                    ({u.emailVerified ? 'Email verified' : 'Email unverified'})
                  </span>
                </div>
                <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{u.email}</div>
                <div className="mt-1 font-mono text-xs text-slate-400">
                  Requested on {formatDate(u.createdAt)}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={tierMap[u.id] || 'view_edit_delete'}
                  onChange={(e) =>
                    setTierMap((m) => ({ ...m, [u.id]: e.target.value as PermissionLevel }))
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="view_only">View Only</option>
                  <option value="view_edit">View & Edit</option>
                  <option value="view_edit_delete">View, Edit & Delete</option>
                </select>

                <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={publicMap[u.id] ?? true}
                    onChange={(e) => setPublicMap((m) => ({ ...m, [u.id]: e.target.checked }))}
                    className="rounded border-slate-300"
                  />
                  <span>Allow Public</span>
                </label>

                <button
                  type="button"
                  onClick={() => handleDecision(u, 'approved')}
                  disabled={processing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Approve</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRejectTarget(u)}
                  disabled={processing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <UserX className="h-3.5 w-3.5" />
                  <span>Reject</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(rejectTarget)}
        title="Reject Registration"
        description={`Reject registration request from ${rejectTarget?.name} (${rejectTarget?.email})? They will remain blocked from signing in.`}
        confirmLabel="Reject Request"
        destructive
        loading={processing}
        onCancel={() => setRejectTarget(null)}
        onConfirm={() => rejectTarget && handleDecision(rejectTarget, 'rejected')}
      />
    </div>
  );
}

export function AdminPermissionsPage() {
  const { apiFetch } = useAuth();
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [edits, setEdits] = useState<
    Record<
      string,
      {
        permissionLevel: PermissionLevel;
        canPublishPublic: boolean;
        maxFileCount: number;
        maxFileSizeMB: number;
        maxStorageMB: number;
      }
    >
  >({});
  const [files, setFiles] = useState<GalleryFileDTO[]>([]);
  const [notes, setNotes] = useState<NoteDTO[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [contentTab, setContentTab] = useState<'files' | 'notes'>('files');

  const loadAll = useCallback(async () => {
    const [uRes, fRes, nRes] = await Promise.all([
      apiFetch('/api/admin/users?status=approved&limit=50'),
      apiFetch('/api/files?ownerId=all&limit=30'),
      apiFetch('/api/notes?ownerId=all&limit=30'),
    ]);
    if (uRes.ok) {
      const uData = await uRes.json();
      const list: UserDTO[] = uData.items || [];
      setUsers(list);
      const nextEdits: typeof edits = {};
      for (const u of list) {
        nextEdits[u.id] = {
          permissionLevel: u.permissionLevel,
          canPublishPublic: u.canPublishPublic,
          maxFileCount: u.maxFileCount,
          maxFileSizeMB: u.maxFileSizeMB,
          maxStorageMB: u.maxStorageMB,
        };
      }
      setEdits(nextEdits);
    }
    if (fRes.ok) {
      const fData = await fRes.json();
      setFiles(fData.items || []);
    }
    if (nRes.ok) {
      const nData = await nRes.json();
      setNotes(nData.items || []);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSaveUserPerms = async (userId: string) => {
    const payload = edits[userId];
    if (!payload) return;
    setSavingId(userId);
    try {
      const res = await apiFetch(`/api/admin/users/${userId}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || 'Could not update permissions.');
        return;
      }
      toast.success(`Permissions and quotas saved for ${d.user.name}.`);
      loadAll();
    } finally {
      setSavingId(null);
    }
  };

  const handleContentVisibility = async (
    kind: 'file' | 'note',
    id: string,
    visibility: Visibility,
    lockedByAdmin: boolean
  ) => {
    const res = await apiFetch(`/api/admin/content/${kind}/${id}/visibility`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility, lockedByAdmin }),
    });
    if (!res.ok) {
      toast.error('Failed to update content visibility.');
      return;
    }
    toast.success('Content visibility policy updated.');
    loadAll();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Permission & Storage Management
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Configure individual permission tiers, upload quotas, and global private/public visibility locks.
        </p>
      </div>

      {/* Permission Inheritance Matrix */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h2 className="font-display text-lg font-semibold">User Permission & Quota Matrix</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            All rules are enforced server-side. Administrators always retain global view/edit/delete override.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Permission Tier</th>
                <th className="px-4 py-3">Public Publish</th>
                <th className="px-4 py-3">Max Files</th>
                <th className="px-4 py-3">Max File (MB)</th>
                <th className="px-4 py-3">Total Quota (MB)</th>
                <th className="px-4 py-3 text-right">Save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => {
                const row = edits[u.id];
                if (!row) return null;
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{u.name}</div>
                      <div className="text-xs text-slate-500">
                        {u.role === 'admin' ? 'Admin (Override active)' : formatPermissionLabel(u.permissionLevel)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={row.permissionLevel}
                        disabled={u.role === 'admin'}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [u.id]: { ...prev[u.id], permissionLevel: e.target.value as PermissionLevel },
                          }))
                        }
                        className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
                      >
                        <option value="view_only">View Only</option>
                        <option value="view_edit">View & Edit</option>
                        <option value="view_edit_delete">View, Edit & Delete</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={row.canPublishPublic}
                        disabled={u.role === 'admin'}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [u.id]: { ...prev[u.id], canPublishPublic: e.target.checked },
                          }))
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        max={10000}
                        value={row.maxFileCount}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [u.id]: { ...prev[u.id], maxFileCount: Number(e.target.value) },
                          }))
                        }
                        className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs tabular-nums dark:border-slate-700 dark:bg-slate-800"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={row.maxFileSizeMB}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [u.id]: { ...prev[u.id], maxFileSizeMB: Number(e.target.value) },
                          }))
                        }
                        className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs tabular-nums dark:border-slate-700 dark:bg-slate-800"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={1}
                        max={50000}
                        value={row.maxStorageMB}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [u.id]: { ...prev[u.id], maxStorageMB: Number(e.target.value) },
                          }))
                        }
                        className="w-24 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs tabular-nums dark:border-slate-700 dark:bg-slate-800"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={savingId === u.id}
                        onClick={() => handleSaveUserPerms(u.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>{savingId === u.id ? 'Saving...' : 'Save'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Global Visibility Governance */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-display text-lg font-semibold">Content Visibility Moderation</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Override or lock private/public visibility on any uploaded file or note.
            </p>
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setContentTab('files')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                contentTab === 'files'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Gallery Files ({files.length})
            </button>
            <button
              type="button"
              onClick={() => setContentTab('notes')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                contentTab === 'notes'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Notes ({notes.length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Visibility</th>
                <th className="px-4 py-3">Admin Lock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(contentTab === 'files' ? files : notes).map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {item.title}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                    {item.ownerName}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={item.visibility}
                      onChange={(e) =>
                        handleContentVisibility(
                          contentTab === 'files' ? 'file' : 'note',
                          item.id,
                          e.target.value as Visibility,
                          item.lockedByAdmin
                        )
                      }
                      className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="private">Private</option>
                      <option value="public">Public</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        handleContentVisibility(
                          contentTab === 'files' ? 'file' : 'note',
                          item.id,
                          item.visibility,
                          !item.lockedByAdmin
                        )
                      }
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
                        item.lockedByAdmin
                          ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {item.lockedByAdmin ? (
                        <>
                          <Lock className="h-3 w-3" />
                          <span>Locked</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="h-3 w-3" />
                          <span>Unlocked</span>
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
