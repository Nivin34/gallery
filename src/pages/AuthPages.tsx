import React, { useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Globe,
  KeyRound,
  MailCheck,
  Moon,
  ShieldAlert,
  ShieldCheck,
  Sun,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface AuthApiResult {
  ok: boolean;
  status: number;
  data: Record<string, any> | null;
  networkError?: boolean;
}

async function authFetchJson(url: string, init?: RequestInit): Promise<AuthApiResult> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init);
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
        continue;
      }
      const raw = await res.text();
      let parsed: Record<string, any> | null = null;
      if (raw) {
        try {
          parsed = JSON.parse(raw) as Record<string, any>;
        } catch {
          parsed = null;
        }
      }
      return { ok: res.ok, status: res.status, data: parsed };
    } catch {
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
        continue;
      }
      return { ok: false, status: 0, data: null, networkError: true };
    }
  }
  return { ok: false, status: 0, data: null, networkError: true };
}

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  onNavigate: (path: string) => void;
  children: React.ReactNode;
}

function AuthLayout({ title, subtitle, onNavigate, children }: AuthLayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const [imageError, setImageError] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA] text-slate-900 dark:bg-[#090D16] dark:text-slate-100">
      {/* 3-Zone Top Bar */}
      <header className="flex h-16 items-center justify-between gap-8 border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => onNavigate('/login')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          FolioVault
        </button>

        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300 sm:flex">
          <button
            type="button"
            onClick={() => onNavigate('/public')}
            className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0"
          >
            Public Gallery
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/login')}
            className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/forgot-password')}
            className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0"
          >
            Recovery
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/signup')}
            className="whitespace-nowrap shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
          >
            Create Account
          </button>
        </div>
      </header>

      {/* Split Workspace */}
      <div className="mx-auto grid w-full max-w-[1280px] flex-1 items-stretch gap-8 px-6 py-8 lg:grid-cols-12 lg:py-12">
        <div className="flex flex-col justify-center lg:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {title}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {subtitle}
            </p>
            <div className="mt-6">{children}</div>
          </div>
        </div>

        <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 dark:border-slate-800 lg:col-span-7 lg:flex lg:flex-col lg:justify-between">
          <div className="relative flex-1 overflow-hidden">
            {!imageError ? (
              <img
                src="/src/assets/images/atelier_gallery_showcase_1795433390699.jpg"
                alt="Editorial workspace archive table with studio notebooks and gallery grid"
                referrerPolicy="no-referrer"
                onError={() => setImageError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full min-h-[360px] items-center justify-center bg-slate-900 p-10 text-slate-400">
                <Globe className="h-12 w-12 opacity-60" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-8 text-white">
              <div className="text-xs font-medium text-slate-300">
                Role-Based Archive · Rich Editorial Notes · Public & Private Galleries
              </div>
              <h2 className="mt-2 max-w-xl font-display text-2xl font-semibold leading-snug">
                Structured document vault and technical writing studio with administrator-enforced permissions.
              </h2>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type AuthNotice = {
  kind: 'pending' | 'rejected' | 'deactivated' | 'error';
  title: string;
  message: string;
};

export function LoginPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { setSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<AuthNotice | null>(null);

  const performLogin = async () => {
    setNotice(null);
    setLoading(true);
    const result = await authFetchJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);

    if (result.networkError) {
      setNotice({
        kind: 'error',
        title: 'Authentication Server Unreachable',
        message:
          'Unable to reach the authentication server right now. Please wait a few seconds and try signing in again.',
      });
      return;
    }

    const data = result.data;
    const code = data?.code;

    if (code === 'PENDING_APPROVAL') {
      setNotice({
        kind: 'pending',
        title: 'Waiting for Administrator Approval',
        message:
          data?.error ||
          'Your account has been registered and is waiting for administrator approval. Please try signing in again once an administrator approves your request.',
      });
      return;
    }
    if (code === 'ACCOUNT_REJECTED') {
      setNotice({
        kind: 'rejected',
        title: 'Registration Rejected',
        message:
          data?.error ||
          'Your registration request was rejected by an administrator. Workspace access has been declined.',
      });
      return;
    }
    if (code === 'ACCOUNT_DEACTIVATED') {
      setNotice({
        kind: 'deactivated',
        title: 'Account Deactivated',
        message:
          data?.error ||
          'Your account has been deactivated by an administrator. Contact your workspace administrator to restore access.',
      });
      return;
    }

    if (!result.ok || data?.authenticated === false) {
      if (result.status === 403 && !data?.error) {
        setNotice({
          kind: 'error',
          title: 'Session Verification Needed',
          message:
            'Your request could not be completed by the preview gateway. Please refresh the page and try signing in again.',
        });
        return;
      }
      setNotice({
        kind: 'error',
        title: 'Sign In Failed',
        message:
          data?.error ||
          'We could not verify your sign-in details right now. Please check your email and password and try again.',
      });
      return;
    }

    if (!data?.token || !data?.user) {
      setNotice({
        kind: 'error',
        title: 'Unexpected Server Response',
        message: 'The server returned an incomplete sign-in response. Please try again in a moment.',
      });
      return;
    }

    setSession(data.token, data.user);
    toast.success(`Welcome back, ${data.user.name}`);
    onNavigate('/dashboard');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin();
  };

  return (
    <AuthLayout
      title="Sign in to FolioVault"
      subtitle="Access your private gallery, rich-text notes, and team permissions."
      onNavigate={onNavigate}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {notice && notice.kind === 'pending' && (
          <div
            role="status"
            className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-100"
          >
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{notice.title}</div>
                <p className="mt-1 text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                  {notice.message}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={performLogin}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {loading ? 'Checking...' : 'Check Status Again'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/public')}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100/60 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200"
                  >
                    Browse Public Gallery
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {notice && notice.kind === 'rejected' && (
          <div
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200"
          >
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{notice.title}</div>
                <p className="mt-1 text-xs leading-relaxed">{notice.message}</p>
              </div>
            </div>
          </div>
        )}

        {notice && notice.kind === 'deactivated' && (
          <div
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200"
          >
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{notice.title}</div>
                <p className="mt-1 text-xs leading-relaxed">{notice.message}</p>
              </div>
            </div>
          </div>
        )}

        {notice && notice.kind === 'error' && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            <div className="font-medium">{notice.title}</div>
            <div className="mt-0.5 text-xs">{notice.message}</div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Email address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@studio.com"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Password
            </label>
            <button
              type="button"
              onClick={() => onNavigate('/forgot-password')}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Forgot password?
            </button>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <span>New to the workspace?</span>
          <button
            type="button"
            onClick={() => onNavigate('/signup')}
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Register an account
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}

export function SignUpPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { setSession } = useAuth();
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [registeredResult, setRegisteredResult] = useState<{
    isFirstUser: boolean;
    recoveryCode: string;
    verificationToken: string | null;
    token: string | null;
    user: any;
    emailVerified: boolean;
  } | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    fetch('/api/auth/bootstrap-status')
      .then((r) => r.json())
      .then((d) => setHasUsers(Boolean(d.hasUsers)))
      .catch(() => setHasUsers(true));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await authFetchJson('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    setLoading(false);

    if (result.networkError) {
      setError('Unable to reach the registration server right now. Please wait a moment and try again.');
      return;
    }

    const data = result.data;
    if (!result.ok || !data) {
      setError(data?.error || `Registration failed (HTTP ${result.status || 'unknown'}).`);
      return;
    }

    setRegisteredResult({
      isFirstUser: Boolean(data.isFirstUser),
      recoveryCode: data.recoveryCode,
      verificationToken: data.verificationToken,
      token: data.token,
      user: data.user,
      emailVerified: Boolean(data.isFirstUser),
    });
    toast.success(data.message || 'Account registered.');
  };

  const handleVerifyEmail = async () => {
    if (!registeredResult?.verificationToken) return;
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: registeredResult.verificationToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Verification failed.');
        return;
      }
      setRegisteredResult((prev) => (prev ? { ...prev, emailVerified: true } : prev));
      toast.success(data.message);
    } catch {
      toast.error('Network error verifying email.');
    }
  };

  if (registeredResult) {
    return (
      <AuthLayout
        title={registeredResult.isFirstUser ? 'Administrator Account Ready' : 'Registration Submitted'}
        subtitle={
          registeredResult.isFirstUser
            ? 'Save your personal recovery code before entering the workspace.'
            : 'Your account is pending administrator approval.'
        }
        onNavigate={onNavigate}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>Personal Password Recovery Code (Save Once)</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <code className="font-mono text-sm font-semibold tracking-wider text-slate-900 dark:text-slate-100">
                {registeredResult.recoveryCode}
              </code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(registeredResult.recoveryCode);
                  setCodeCopied(true);
                  toast.success('Recovery code copied.');
                }}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
              >
                {codeCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{codeCopied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Store this code safely. You can use it to reset your password without waiting for an administrator.
            </p>
          </div>

          {!registeredResult.isFirstUser && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex items-center gap-2 font-semibold">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span>Waiting for Administrator Approval</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed">
                Your registration has been submitted. An administrator must approve or reject your request before you can sign in and access private workspace pages.
              </p>
              {!registeredResult.emailVerified && registeredResult.verificationToken && (
                <button
                  type="button"
                  onClick={handleVerifyEmail}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                >
                  <MailCheck className="h-3.5 w-3.5" />
                  <span>Verify Email Address Now</span>
                </button>
              )}
              {registeredResult.emailVerified && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  <span>Email verified</span>
                </div>
              )}
            </div>
          )}

          {registeredResult.isFirstUser && registeredResult.token ? (
            <button
              type="button"
              onClick={() => {
                setSession(registeredResult.token!, registeredResult.user);
                onNavigate('/dashboard');
              }}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Continue to Admin Workspace
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('/login')}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Return to Sign In
            </button>
          )}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle={
        hasUsers === false
          ? 'No users exist yet — the first registered account automatically becomes Administrator.'
          : 'New registrations enter Pending Approval until reviewed by an administrator.'
      }
      onNavigate={onNavigate}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {hasUsers === false && (
          <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Initial setup detected: registering this account grants full Administrator privileges immediately.
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Full name
          </label>
          <input
            type="text"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Rivera"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Email address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@studio.com"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Password (minimum 8 characters)
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a strong password"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>

        <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <span>Already registered?</span>
          <button
            type="button"
            onClick={() => onNavigate('/login')}
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Sign in instead
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [mode, setMode] = useState<'recovery_code' | 'admin_request'>('recovery_code');
  const [email, setEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, mode, recoveryCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not process recovery request.');
        return;
      }
      if (data.verified && data.resetToken) {
        toast.success('Recovery code verified.');
        onNavigate(`/reset-password?token=${encodeURIComponent(data.resetToken)}`);
        return;
      }
      setMessage(data.message);
    } catch {
      setError('Network error submitting recovery request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Account Recovery"
      subtitle="Verify with your personal recovery code or submit a reset request to an administrator."
      onNavigate={onNavigate}
    >
      <div className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => setMode('recovery_code')}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'recovery_code'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Recovery Code
        </button>
        <button
          type="button"
          onClick={() => setMode('admin_request')}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'admin_request'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Admin Reset Request
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            {message}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Account email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@studio.com"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

        {mode === 'recovery_code' && (
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Personal recovery code
            </label>
            <input
              type="text"
              required
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder="FV-XXXX-XXXX-XXXX"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading
            ? 'Verifying...'
            : mode === 'recovery_code'
              ? 'Verify & Reset Password'
              : 'Send Reset Request'}
        </button>

        <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <button
            type="button"
            onClick={() => onNavigate('/reset-password')}
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Already have a reset token?
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/login')}
            className="hover:underline"
          >
            Back to Sign In
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}

export function ResetPasswordPage({
  initialToken = '',
  onNavigate,
}: {
  initialToken?: string;
  onNavigate: (path: string) => void;
}) {
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not reset password.');
        return;
      }
      toast.success('Password updated. Please sign in.');
      onNavigate('/login');
    } catch {
      setError('Network error resetting password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Set New Password"
      subtitle="Enter your single-use reset token and choose a new password."
      onNavigate={onNavigate}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Reset token
          </label>
          <input
            type="text"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste reset token"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            New password
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Confirm new password
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat new password"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Updating Password...' : 'Reset Password'}
        </button>

        <div className="border-t border-slate-200 pt-4 text-right text-xs dark:border-slate-800">
          <button
            type="button"
            onClick={() => onNavigate('/login')}
            className="text-slate-600 hover:underline dark:text-slate-400"
          >
            Back to Sign In
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
