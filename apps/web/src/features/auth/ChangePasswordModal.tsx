import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema } from '@campus/shared';
import { z } from 'zod';
import { api, ApiError } from '../../api/client';
import { Button, Field, Modal } from '../../components/ui';
import { pushToast } from '../notifications/Toasts';

type F = z.infer<typeof changePasswordSchema>;

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const f = useForm<F>({ resolver: zodResolver(changePasswordSchema) });
  const submit = f.handleSubmit(async (v) => {
    try {
      await api('/auth/change-password', { method: 'POST', json: v });
      pushToast({ title: 'Password changed', tone: 'ok' });
      f.reset();
      onClose();
    } catch (e) {
      f.setError('oldPassword', { message: e instanceof ApiError ? e.message : 'Could not change password' });
    }
  });
  return (
    <Modal open={open} onClose={onClose} title="Change password">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Current password" error={f.formState.errors.oldPassword?.message}>
          <input type="password" className="input" autoComplete="current-password" {...f.register('oldPassword')} />
        </Field>
        <Field label="New password" error={f.formState.errors.newPassword?.message} hint="At least 8 characters.">
          <input type="password" className="input" autoComplete="new-password" {...f.register('newPassword')} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={f.formState.isSubmitting}>Change password</Button>
        </div>
      </form>
    </Modal>
  );
}
