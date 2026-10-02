import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { loginSchema, registerSchema } from '@campus/shared';
import { ApiError } from '../../api/client';
import { landingFor, useAuth } from '../../auth/AuthProvider';
import { Button, Field, Segmented } from '../../components/ui';
import { useAppConfig } from '../../api/hooks';

const DEMO = [
  { email: 'student01@campus.local', label: 'Student' },
  { email: 'it1@campus.local', label: 'IT staff' },
  { email: 'manager@campus.local', label: 'Manager' },
  { email: 'admin@campus.local', label: 'Admin' },
];

export function LoginPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const lf = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const rf = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema) });
  const [err, setErr] = useState<string | null>(null);

  if (user) return <Navigate to={landingFor(user.role)} replace />;

  const go = (role: Parameters<typeof landingFor>[0]) => {
    const from = loc.state?.from;
    nav(from && from !== '/login' ? from : landingFor(role), { replace: true });
  };
  const onLogin = lf.handleSubmit(async (v) => {
    setErr(null);
    try {
      go((await login(v.email, v.password)).role);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Sign in failed');
    }
  });
  const onRegister = rf.handleSubmit(async (v) => {
    setErr(null);
    try {
      go((await register(v.name, v.email, v.password)).role);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Registration failed');
    }
  });

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-ink p-12 text-[#c9d4e5] lg:flex lg:flex-col">
        <SignalArt />
        <div className="relative flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden>
            <rect width="32" height="32" rx="8" fill="#ffffff14" />
            <path d="M6 13a14 14 0 0 1 20 0" stroke="#7fb3f0" strokeWidth="2.6" fill="none" strokeLinecap="round" />
            <path d="M10 17.5a8.5 8.5 0 0 1 12 0" stroke="#7fb3f0" strokeWidth="2.6" fill="none" strokeLinecap="round" />
            <circle cx="16" cy="22.5" r="2.6" fill="#22c55e" />
          </svg>
          <span className="font-cond text-lg font-semibold text-white">Campus Wi-Fi</span>
        </div>
        <div className="relative mt-auto max-w-[30ch]">
          <h1 className="font-cond text-[44px] font-semibold leading-[1.05] tracking-tight text-white">Know where the Wi-Fi is struggling — before the complaints pile up.</h1>
          <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-[#9fb0c9]">
            Run a speed test from where you're sitting, report a problem with the result attached, and give the IT team a live map of network health across every building.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <span className="font-cond text-2xl font-semibold">Campus Wi-Fi</span>
            <p className="text-sm text-ink-3">Network health monitor</p>
          </div>
          <Segmented
            value={mode}
            onChange={(m) => { setMode(m); setErr(null); }}
            options={[{ value: 'login', label: 'Sign in' }, { value: 'register', label: 'Create account' }]}
          />
          <h2 className="mt-6 text-2xl font-semibold">{mode === 'login' ? 'Sign in' : 'Create a student / staff account'}</h2>
          <p className="mt-1 text-sm text-ink-3">{mode === 'login' ? 'Use your campus account.' : 'IT staff accounts are created by the administrator.'}</p>

          {err && <div className="mt-4 rounded-lg border border-[#f3b7b7] bg-[#fdf3f3] px-3 py-2.5 text-sm text-[#7f1515]" role="alert">{err}</div>}

          {mode === 'login' ? (
            <form onSubmit={onLogin} className="mt-6 space-y-4" noValidate>
              <Field label="Email" htmlFor="email" error={lf.formState.errors.email?.message}>
                <input id="email" className="input" type="email" autoComplete="username" {...lf.register('email')} />
              </Field>
              <Field label="Password" htmlFor="password" error={lf.formState.errors.password?.message}>
                <input id="password" className="input" type="password" autoComplete="current-password" {...lf.register('password')} />
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={lf.formState.isSubmitting}>Sign in</Button>
            </form>
          ) : (
            <form onSubmit={onRegister} className="mt-6 space-y-4" noValidate>
              <Field label="Full name" htmlFor="name" error={rf.formState.errors.name?.message}>
                <input id="name" className="input" autoComplete="name" {...rf.register('name')} />
              </Field>
              <Field label="Email" htmlFor="remail" error={rf.formState.errors.email?.message}>
                <input id="remail" className="input" type="email" autoComplete="email" {...rf.register('email')} />
              </Field>
              <Field label="Password" htmlFor="rpass" error={rf.formState.errors.password?.message} hint="At least 8 characters.">
                <input id="rpass" className="input" type="password" autoComplete="new-password" {...rf.register('password')} />
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={rf.formState.isSubmitting}>Create account</Button>
            </form>
          )}

          {mode === 'login' && (
            <div className="mt-8 rounded-xl border border-dashed border-line-strong bg-white/60 p-4">
              <p className="text-[13px] font-medium text-ink-2">Demo accounts</p>
              <p className="text-[12.5px] text-ink-3">Fills the form with a seeded account (password Passw0rd!demo).</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DEMO.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    className="rounded-full border border-line-strong bg-white px-3 py-1 text-[13px] hover:border-accent hover:text-accent"
                    onClick={() => {
                      lf.setValue('email', d.email);
                      lf.setValue('password', 'Passw0rd!demo');
                      setErr(null);
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Concentric signal rings — the campus heard as radio. */
function SignalArt() {
  return (
    <svg className="pointer-events-none absolute -right-40 -top-40 h-[720px] w-[720px] opacity-60" viewBox="0 0 720 720" aria-hidden>
      {[60, 120, 180, 240, 300, 360].map((r, i) => (
        <circle key={r} cx="360" cy="360" r={r} fill="none" stroke="#7fb3f0" strokeOpacity={0.28 - i * 0.04} strokeWidth="1.5" strokeDasharray={i % 2 ? '2 8' : undefined} />
      ))}
      {[
        [300, 250, '#22c55e'], [440, 300, '#22c55e'], [390, 430, '#eab308'], [250, 400, '#22c55e'], [470, 470, '#ef4444'], [340, 520, '#15803d'],
      ].map(([x, y, c], i) => (
        <circle key={i} cx={x as number} cy={y as number} r="7" fill={c as string} />
      ))}
    </svg>
  );
}
