'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiErrorMessage } from '@/lib/api';
import type { ApiEnvelope, Branch, RoleOption } from '@/lib/types';
import { Modal } from './Modal';

interface AddStaffModalProps {
  open: boolean;
  onClose: () => void;
  roles: RoleOption[];
  branches: Branch[];
}

const inputClass =
  'w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-text-primary placeholder-text-muted outline-none transition-colors focus:border-input-focus focus:ring-2 focus:ring-input-focus/30';

export function AddStaffModal({ open, onClose, roles, branches }: AddStaffModalProps) {
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [branchId, setBranchId] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Default the select to "Staff" (or the first role) until the user picks one.
  const defaultRoleId =
    roles.find((r) => r.name.toLowerCase() === 'staff')?.id ?? roles[0]?.id ?? '';
  const selectedRoleId = roleId || defaultRoleId;

  // Determine whether the chosen role is "Staff" (which should require a branch).
  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const isStaffRole = selectedRole?.name === 'Staff';

  const activeBranches = branches.filter((b) => b.isActive);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        firstName,
        lastName,
        email,
        password,
        roleId: selectedRoleId,
      };
      if (branchId) {
        payload.branchId = branchId;
      }
      const response = await api.post<ApiEnvelope<unknown>>('/users', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      handleClose();
    },
    onError: (err) => {
      setFormError(getApiErrorMessage(err, 'Could not create the staff account.'));
    },
  });

  function resetForm() {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setRoleId('');
    setBranchId('');
    setFormError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }
    if (!selectedRoleId) {
      setFormError('Please choose a role.');
      return;
    }
    if (isStaffRole && !branchId) {
      setFormError('Please assign this Staff member to a branch.');
      return;
    }
    mutation.mutate();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add new staff">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">First name</label>
            <input
              className={inputClass}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Last name</label>
            <input
              className={inputClass}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Email</label>
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@gmail.com"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Role</label>
          <select
            className={inputClass}
            value={selectedRoleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            {roles.length === 0 && <option value="">Loading roles…</option>}
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">
            Branch {isStaffRole && <span className="text-accent-red">*</span>}
          </label>
          <select
            className={inputClass}
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="">
              {isStaffRole ? '— Select a branch —' : '— No branch (Admin) —'}
            </option>
            {activeBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-text-muted">
            Staff can only sell from their assigned branch.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Password</label>
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Confirm password</label>
          <input
            type="password"
            className={inputClass}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        <p className="text-xs text-text-muted">
          Min 8 characters, with an uppercase, lowercase, a number and a special character (@$!%*?&).
        </p>

        {formError && (
          <div className="rounded-lg bg-accent-red/10 border border-accent-red/30 px-3 py-2 text-sm text-accent-red">{formError}</div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-text-secondary hover:opacity-80 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="btn-grad rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {mutation.isPending ? 'Creating…' : 'Create staff'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
