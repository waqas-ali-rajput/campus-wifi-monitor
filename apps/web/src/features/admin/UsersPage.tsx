import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Search, UserPlus } from 'lucide-react';
import { ROLES, ROLE_LABELS, ROLE_PERMISSIONS, createUserSchema, type Role } from '@campus/shared';
import { api, ApiError } from '../../api/client';
import { useApiMutation, useUsers } from '../../api/hooks';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Button, Card, Field, Modal, PageHeader, QueryState } from '../../components/ui';
import { pushToast } from '../notifications/Toasts';

type F = z.infer<typeof createUserSchema>;

const CAPS: Array<[string, string]> = [
  ['tests.run', 'Run speed tests, report problems'],
  ['complaints.transition', 'Review, assign and resolve complaints'],
  ['maintenance.manage', 'Maintenance and outages'],
  ['analytics.view', 'Dashboard, insights and analytics'],
  ['reports.view', 'Reports, staff activity, CSV'],
  ['locations.manage', 'Manage locations'],
  ['users.manage', 'Manage users and roles'],
  ['settings.write', 'Configure thresholds'],
];

export function UsersPage() {
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const users = useUsers({ q, role });
  const [open, setOpen] = useState(false);
  const [reset, setReset] = useState<{ id: string; name: string } | null>(null);
  const patch = useApiMutation((v: { id: string; body: Record<string, unknown> }) => api(`/admin/users/${v.id}`, { method: 'PATCH', json: v.body }), [['admin', 'users'], ['staff']]);
  const doPatch = async (id: string, body: Record<string, unknown>, msg: string) => {
    try {
      await patch.mutateAsync({ id, body });
      pushToast({ title: msg, tone: 'ok' });
    } catch (e) {
      pushToast({ title: 'Change not saved', body: e instanceof ApiError ? e.message : undefined, tone: 'danger' });
    }
  };
  return (
    <>
      <PageHeader title="Users & roles" subtitle="Create IT staff accounts, change roles (permissions follow the role) and suspend access." actions={<Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setOpen(true)}>Add user</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" />
          <input className="input h-9 w-[240px] pl-9 text-sm" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input h-9 w-auto py-0 text-sm" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card pad={false}>
          <QueryState q={users}>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Name</th><th>Role</th><th>Status</th><th className="text-right">Tests</th><th className="text-right">Complaints</th><th /></tr></thead>
                <tbody>
                  {users.data?.items.map((u) => (
                    <tr key={u.user_id}>
                      <td><div className="font-medium">{u.name}{u.user_id === me?.user_id && <span className="ml-1 text-ink-4">(you)</span>}</div><div className="text-[12px] text-ink-3">{u.email}</div></td>
                      <td>
                        <select
                          className="input h-8 w-auto py-0 text-[13px]"
                          value={u.role}
                          disabled={u.user_id === me?.user_id}
                          onChange={(e) => doPatch(u.user_id, { role: e.target.value }, `${u.name} is now ${ROLE_LABELS[e.target.value as Role]}`)}
                          aria-label={`Role for ${u.name}`}
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      </td>
                      <td>{u.account_status === 'active' ? <Badge tone="ok">Active</Badge> : <Badge tone="danger">Suspended</Badge>}</td>
                      <td className="num text-right">{u.tests}</td>
                      <td className="num text-right">{u.complaints}</td>
                      <td className="whitespace-nowrap text-right">
                        {u.user_id !== me?.user_id && (
                          <Button size="sm" variant="ghost" onClick={() => doPatch(u.user_id, { account_status: u.account_status === 'active' ? 'suspended' : 'active' }, u.account_status === 'active' ? `${u.name} suspended` : `${u.name} reactivated`)}>
                            {u.account_status === 'active' ? 'Suspend' : 'Activate'}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setReset({ id: u.user_id, name: u.name })}>Reset password</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </QueryState>
        </Card>
        <Card title="Role permissions" subtitle="Fixed per role. Change someone's role to change what they can do.">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr><th className="pb-2 text-left font-medium text-ink-3">Capability</th>{ROLES.map((r) => <th key={r} className="px-1 pb-2 text-center font-medium text-ink-3">{ROLE_LABELS[r].split(' ')[0]}</th>)}</tr></thead>
              <tbody>
                {CAPS.map(([p, label]) => (
                  <tr key={p} className="border-t border-line/70">
                    <td className="py-1.5 pr-2 text-ink-2">{label}</td>
                    {ROLES.map((r) => <td key={r} className="text-center">{ROLE_PERMISSIONS[r].has(p as never) ? <span className="text-st-excellent" aria-label="yes">✔</span> : <span className="text-ink-4" aria-label="no">–</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <CreateUser open={open} onClose={() => setOpen(false)} />
      <ResetPassword target={reset} onClose={() => setReset(null)} />
    </>
  );
}

function CreateUser({ open, onClose }: { open: boolean; onClose: () => void }) {
  const f = useForm<F>({ resolver: zodResolver(createUserSchema), defaultValues: { role: 'it_staff', name: '', email: '', password: '' } });
  const create = useApiMutation((v: F) => api('/admin/users', { method: 'POST', json: v }), [['admin', 'users'], ['staff']]);
  const submit = f.handleSubmit(async (v) => {
    try {
      await create.mutateAsync(v);
      pushToast({ title: `${v.name} added as ${ROLE_LABELS[v.role]}`, tone: 'ok' });
      f.reset();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.details) for (const [k, m] of Object.entries(e.details)) f.setError(k as keyof F, { message: m[0] });
      else f.setError('root', { message: e instanceof Error ? e.message : 'Could not create' });
    }
  });
  return (
    <Modal open={open} onClose={onClose} title="Add user">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" error={f.formState.errors.name?.message}><input className="input" {...f.register('name')} /></Field>
        <Field label="Email" error={f.formState.errors.email?.message}><input className="input" type="email" {...f.register('email')} /></Field>
        <Field label="Temporary password" error={f.formState.errors.password?.message} hint="At least 8 characters. Ask them to change it after signing in."><input className="input" type="text" {...f.register('password')} /></Field>
        <Field label="Role">
          <select className="input" {...f.register('role')}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
        </Field>
        {f.formState.errors.root && <p className="text-sm text-st-critical">{f.formState.errors.root.message}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={create.isPending}>Add user</Button></div>
      </form>
    </Modal>
  );
}

function ResetPassword({ target, onClose }: { target: { id: string; name: string } | null; onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const m = useApiMutation((v: string) => api(`/admin/users/${target!.id}`, { method: 'PATCH', json: { new_password: v } }));
  return (
    <Modal open={!!target} onClose={onClose} title={`Reset password for ${target?.name ?? ''}`}>
      <Field label="New password" error={err ?? undefined} hint="At least 8 characters."><input className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={m.isPending} onClick={async () => {
          if (pw.length < 8) return setErr('Password must be at least 8 characters');
          try { await m.mutateAsync(pw); pushToast({ title: 'Password reset', tone: 'ok' }); setPw(''); setErr(null); onClose(); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
        }}>Reset password</Button>
      </div>
    </Modal>
  );
}
