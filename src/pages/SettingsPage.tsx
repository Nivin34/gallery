import React, { useState } from 'react';
import { Check, Copy, KeyRound, Save, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { formatBytes, formatDate, formatPermissionLabel } from '../lib/format';

export function SettingsPage() {
  const { user, apiFetch, setSession, token, updateUserState } = useAuth();
  const { theme, setTheme } = useTheme();

  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!user) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name, bio, themePreference: theme }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not update profile.');
        return;
      }
      updateUserState(data.user);
      toast.success('Profile updated.');
    } catch {
      toast.error('Network error updating profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    try {
      const res = await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Password update failed.');
        return;
      }
      if (data.token) {
        setSession(data.token, data.user);
      } else {
        updateUserState(data.user);
      }
      setCurrentPassword('');
      setNewPassword('');
      toast.success('Password changed. Active sessions refreshed.');
    } catch {
      toast.error('Network error changing password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleRegenerateRecovery = async () => {
    try {
      const res = await apiFetch('/api/auth/regenerate-recovery-code', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Unable to regenerate recovery code.');
        return;
      }
      setNewRecoveryCode(data.recoveryCode);
      setCopiedCode(false);
      toast.success('New recovery code generated. Save it now.');
    } catch {
      toast.error('Network error regenerating recovery code.');
    }
  };

  const storageQuotaBytes = user.maxStorageMB * 1024 * 1024;
  const storagePct = Math.min(100, Math.round((user.usedStorageBytes / Math.max(1, storageQuotaBytes)) * 100));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Profile & Settings
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage your profile details, appearance preference, security credentials, and quota limits.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Form */}
        <form
          onSubmit={handleSaveProfile}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2"
        >
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            Account Information
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Display Name
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Email Address
              </label>
              <input
                type="email"
                disabled
                value={user.email}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/60"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Bio
            </label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Short bio displayed alongside public notes..."
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Interface Theme
            </label>
            <div className="mt-1.5 inline-flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  theme === 'light'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Light Mode
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  theme === 'dark'
                    ? 'bg-slate-900 text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Dark Mode
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{savingProfile ? 'Saving...' : 'Save Profile'}</span>
            </button>
          </div>
        </form>

        {/* Permission & Quota Card */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Permissions & Quotas
            </h2>
          </div>

          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">Role</dt>
              <dd className="font-medium capitalize text-slate-900 dark:text-slate-100">{user.role}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">Permission Tier</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {user.role === 'admin' ? 'Full Administrator' : formatPermissionLabel(user.permissionLevel)}
              </dd>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">Public Publishing</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {user.role === 'admin' || user.canPublishPublic ? 'Allowed' : 'Restricted'}
              </dd>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">File Count</dt>
              <dd className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {user.fileCount} / {user.role === 'admin' ? '∞' : user.maxFileCount}
              </dd>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">Max File Size</dt>
              <dd className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {user.maxFileSizeMB} MB
              </dd>
            </div>
            <div className="flex items-center justify-between pb-1">
              <dt className="text-slate-500 dark:text-slate-400">Member Since</dt>
              <dd className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                {formatDate(user.createdAt)}
              </dd>
            </div>
          </dl>

          <div className="pt-2">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Storage Used</span>
              <span className="font-mono tabular-nums">
                {formatBytes(user.usedStorageBytes)} / {user.maxStorageMB} MB
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${storagePct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Password & Recovery */}
      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleChangePassword}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            Change Password
          </h2>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Current Password
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              New Password (min 8 characters)
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <button
            type="submit"
            disabled={savingPassword || !token}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {savingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </form>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Personal Recovery Code
              </h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              If you ever lose access to your password, your recovery code lets you verify ownership and set a new password immediately. Regenerating invalidates your previous code.
            </p>

            {newRecoveryCode && (
              <div className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                <code className="font-mono text-sm font-semibold tracking-wider text-slate-900 dark:text-slate-100">
                  {newRecoveryCode}
                </code>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(newRecoveryCode);
                    setCopiedCode(true);
                    toast.success('Recovery code copied.');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400"
                >
                  {copiedCode ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            )}
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={handleRegenerateRecovery}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Regenerate Recovery Code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
