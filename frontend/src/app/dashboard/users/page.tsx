'use client';

import { useState } from 'react';
import { Search, Plus, Pencil, Trash2, X, Eye, EyeOff, RefreshCw, Loader2 } from 'lucide-react';
import {
  useUsers,
  useRoles,
  useBranches,
  useCreateUser,
  useUpdateUser,
  useResetUserPassword,
  useArchiveUser,
} from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';
import { fileToResizedDataUrl } from '@/lib/image';
import { useAuthStore } from '@/lib/store';
import type { FullUser } from '@/lib/types';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card-bg border border-card-border rounded-lg shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text-primary">{title}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface FormData {
  firstName: string;
  middleInitial: string;
  lastName: string;
  email: string;
  roleId: string;
  branchId: string;
  isActive: boolean;
  password: string;
  confirmPassword: string;
  avatarUrl: string;
}

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, error } = useUsers(search);
  const { data: roles = [] } = useRoles();
  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetUserPassword();
  const archiveUser = useArchiveUser();

  const users = data?.data ?? [];
  const currentRole = useAuthStore((s) => s.user?.role?.name);
  const isOwner = currentRole === 'Owner';

  // Filter users based on current user's role:
  // - Owner sees all (Owner + Admin + Staff)
  // - Admin sees only Admin + Staff (Owner hidden)
  const visibleUsers = isOwner ? users : users.filter((u) => u.role.name !== 'Owner');

  // Filter roles in dropdown: Admin can't create Owner accounts
  const availableRoles = isOwner ? roles : roles.filter((r) => r.name !== 'Owner');

  const [entriesPerPage, setEntriesPerPage] = useState<number | 'All'>(10);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<FullUser | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    firstName: '', middleInitial: '', lastName: '', email: '',
    roleId: '', branchId: '', isActive: true, password: '', confirmPassword: '', avatarUrl: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const selectedRoleName = roles.find((r) => r.id === formData.roleId)?.name;
  const isStaffRole = selectedRoleName === 'Staff';

  const totalPages = entriesPerPage === 'All' ? 1 : Math.max(1, Math.ceil(visibleUsers.length / entriesPerPage));
  const pageStart = entriesPerPage === 'All' ? 0 : (currentPage - 1) * entriesPerPage;
  const displayedUsers = entriesPerPage === 'All' ? visibleUsers : visibleUsers.slice(pageStart, pageStart + entriesPerPage);

  const resetForm = () => {
    setFormData({
      firstName: '', middleInitial: '', lastName: '', email: '',
      roleId: roles.find((r) => r.name === 'Staff')?.id ?? roles[0]?.id ?? '',
      branchId: branches[0]?.id ?? '', isActive: true, password: '', confirmPassword: '', avatarUrl: '',
    });
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFormError(null);
  };

  const handleAdd = () => { resetForm(); setShowAddModal(true); };

  const handleEdit = (user: FullUser) => {
    setSelectedUser(user);
    setFormError(null);
    setFormData({
      firstName: user.firstName,
      middleInitial: user.middleInitial ?? '',
      lastName: user.lastName,
      email: user.email,
      roleId: user.role.id,
      branchId: user.branchId ?? branches[0]?.id ?? '',
      isActive: user.isActive,
      password: '',
      confirmPassword: '',
      avatarUrl: user.avatarUrl ?? '',
    });
    setShowEditModal(true);
  };

  const handleArchive = (user: FullUser) => { setSelectedUser(user); setFormError(null); setShowArchiveModal(true); };

  const confirmArchive = async () => {
    if (!selectedUser) return;
    try {
      await archiveUser.mutateAsync(selectedUser.id);
      setShowArchiveModal(false);
      setSelectedUser(null);
    } catch (e) { setFormError(getApiErrorMessage(e)); }
  };

  const validate = (requirePassword: boolean) => {
    if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.email.trim()) {
      setFormError('First name, last name and email are required.');
      return false;
    }
    if (!formData.roleId) { setFormError('Please select a role.'); return false; }
    if (isStaffRole && !formData.branchId) { setFormError('Staff must be assigned to a shop.'); return false; }
    if ((requirePassword || formData.password || formData.confirmPassword) && formData.password !== formData.confirmPassword) {
      setFormError('Passwords do not match.');
      return false;
    }
    if (requirePassword && !formData.password) { setFormError('Password is required.'); return false; }
    setFormError(null);
    return true;
  };

  const handleSaveUser = async () => {
    if (!validate(true)) return;
    try {
      await createUser.mutateAsync({
        email: formData.email.trim(),
        password: formData.password,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        middleInitial: formData.middleInitial.trim() || undefined,
        roleId: formData.roleId,
        branchId: isStaffRole ? formData.branchId : undefined,
        avatarUrl: formData.avatarUrl || undefined,
      });
      setShowAddModal(false);
    } catch (e) { setFormError(getApiErrorMessage(e)); }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser || !validate(false)) return;
    try {
      await updateUser.mutateAsync({
        id: selectedUser.id,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        middleInitial: formData.middleInitial.trim() || undefined,
        email: formData.email.trim(),
        roleId: formData.roleId,
        branchId: isStaffRole ? formData.branchId : null,
        isActive: formData.isActive,
        avatarUrl: formData.avatarUrl,
      });
      if (formData.password) {
        await resetPassword.mutateAsync({
          id: selectedUser.id,
          newPassword: formData.password,
          confirmPassword: formData.confirmPassword,
        });
      }
      setShowEditModal(false);
      setSelectedUser(null);
    } catch (e) { setFormError(getApiErrorMessage(e)); }
  };

  const generatePassword = () => {
    // Guarantee at least one of each required class for the backend policy.
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const nums = '23456789';
    const special = '!@#$%*?';
    const all = upper + lower + nums + special;
    let pwd = upper[Math.floor(Math.random() * upper.length)]
      + lower[Math.floor(Math.random() * lower.length)]
      + nums[Math.floor(Math.random() * nums.length)]
      + special[Math.floor(Math.random() * special.length)];
    for (let i = 0; i < 8; i++) pwd += all[Math.floor(Math.random() * all.length)];
    const shuffled = pwd.split('').sort(() => Math.random() - 0.5).join('');
    setFormData((f) => ({ ...f, password: shuffled, confirmPassword: shuffled }));
    setShowPassword(true);
    setShowConfirmPassword(true);
  };

  const isSaving = createUser.isPending || updateUser.isPending || resetPassword.isPending;

  const renderUserForm = (isEdit: boolean) => (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {formData.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={formData.avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover border border-card-border" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white text-lg font-bold border border-card-border">
            {(formData.firstName[0] ?? '').toUpperCase()}{(formData.lastName[0] ?? '').toUpperCase()}
          </div>
        )}
        <div className="text-sm">
          <label className="inline-block cursor-pointer bg-btn-primary text-btn-primary-text px-3 py-1.5 rounded-lg hover:opacity-90">
            Upload Photo
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const dataUrl = await fileToResizedDataUrl(file, 256, 0.85);
                  setFormData((f) => ({ ...f, avatarUrl: dataUrl }));
                } catch (err) {
                  setFormError(err instanceof Error ? err.message : 'Could not process image.');
                }
              }}
            />
          </label>
          {formData.avatarUrl && (
            <button type="button" onClick={() => setFormData((f) => ({ ...f, avatarUrl: '' }))} className="ml-2 text-accent-red hover:underline text-xs">Remove</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">First Name</label>
          <input type="text" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">M.I.</label>
          <input type="text" value={formData.middleInitial} onChange={(e) => setFormData({ ...formData, middleInitial: e.target.value })} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus text-sm" maxLength={2} />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Last Name</label>
          <input type="text" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Status</label>
          <select value={formData.isActive ? 'Active' : 'Disabled'} onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'Active' })} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus text-sm">
            <option value="Active">Active</option>
            <option value="Disabled">Disabled</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Role</label>
          <select value={formData.roleId} onChange={(e) => setFormData({ ...formData, roleId: e.target.value })} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus text-sm">
            <option value="">Select role</option>
            {availableRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </div>

      {isStaffRole && (
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Shop</label>
          <select value={formData.branchId} onChange={(e) => setFormData({ ...formData, branchId: e.target.value })} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus text-sm">
            <option value="">Select shop</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Email</label>
        <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">
          Password {isEdit && <span className="text-text-muted font-normal">(Leave blank to keep current password)</span>}
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus text-sm pr-10" placeholder={isEdit ? 'Leave blank to keep current' : ''} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button type="button" onClick={generatePassword} className="px-3 py-2 bg-accent-blue text-white rounded-lg text-sm flex items-center gap-1 hover:opacity-90">
            <RefreshCw size={14} /> Generate
          </button>
        </div>
        <p className="text-xs text-text-muted mt-1">Minimum 4 characters.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Confirm Password</label>
        <div className="relative">
          <input type={showConfirmPassword ? 'text' : 'password'} value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus text-sm pr-10" />
          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {formError && (
        <div className="rounded-lg bg-accent-red/10 border border-accent-red/30 px-3 py-2 text-sm text-accent-red">{formError}</div>
      )}

      <button onClick={isEdit ? handleUpdateUser : handleSaveUser} disabled={isSaving} className="w-full btn-grad py-2.5 rounded-lg font-medium disabled:opacity-60">
        {isSaving ? 'Saving...' : isEdit ? 'Update User' : 'Save User'}
      </button>
    </div>
  );

  return (
    <div className="p-6 bg-page-bg min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Users</h1>
        <button onClick={handleAdd} className="flex items-center gap-2 btn-grad px-4 py-2 rounded-lg font-medium">
          <Plus size={18} /> Add New User
        </button>
      </div>

      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm">
        <div className="p-4 flex items-center justify-between border-b border-card-border">
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">Show</label>
            <select value={entriesPerPage} onChange={(e) => { setEntriesPerPage(e.target.value === 'All' ? 'All' : Number(e.target.value)); setCurrentPage(1); }} className="px-2 py-1 border border-input-border rounded text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus">
              {[5, 10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              <option value="All">All</option>
            </select>
            <span className="text-sm text-text-secondary">entries</span>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" placeholder="Search users..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="pl-9 pr-4 py-2 border border-input-border rounded-lg bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus w-64" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Image</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Shop</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Last Login</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading users...</td></tr>
              ) : isError ? (
                <tr><td colSpan={9} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
              ) : displayedUsers.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-text-muted">No users found.</td></tr>
              ) : displayedUsers.map((user, idx) => (
                <tr key={user.id} className="border-b border-card-border transition">
                  <td className="px-4 py-3 text-sm text-text-primary">{pageStart + idx + 1}</td>
                  <td className="px-4 py-3">
                    {user.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs text-text-muted">
                        {user.firstName[0]}{user.lastName[0]}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary font-medium">
                    {user.firstName} {user.middleInitial ? `${user.middleInitial}. ` : ''}{user.lastName}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{user.email}</td>
                  <td className="px-4 py-3"><span className="badge badge-neutral">{user.role.name}</span></td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{user.branch?.name ?? 'N/A'}</td>
                  <td className="px-4 py-3">
                    <span className="badge badge-neutral">
                      <span className={`badge-dot ${user.isActive ? 'bg-accent-green' : 'bg-accent-red'}`} />
                      {user.isActive ? 'Active' : 'Disabled'}
                    </span>
                    {user.isLocked && (
                      <span className="ml-1 rounded-full bg-accent-red/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-accent-red">Locked</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEdit(user)} className="p-1.5 text-accent-blue hover:bg-accent-blue/10 rounded-lg transition" title="Edit">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleArchive(user)} className="p-1.5 text-accent-red hover:bg-accent-red/10 rounded-lg transition" title="Archive">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-text-secondary">
          <span>Showing {users.length === 0 ? 0 : pageStart + 1} to {pageStart + displayedUsers.length} of {users.length} entries</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2.5 py-1 rounded-lg border border-card-border disabled:opacity-50 hover:opacity-80 transition-colors">Previous</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => setCurrentPage(p)} className={`px-2.5 py-1 rounded-lg transition-colors ${p === currentPage ? 'bg-btn-primary text-btn-primary-text' : 'border border-card-border hover:opacity-80'}`}>{p}</button>
              ))}
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2.5 py-1 rounded-lg border border-card-border disabled:opacity-50 hover:opacity-80 transition-colors">Next</button>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <Modal title="Add New User" onClose={() => setShowAddModal(false)}>{renderUserForm(false)}</Modal>
      )}
      {showEditModal && (
        <Modal title="Edit User" onClose={() => setShowEditModal(false)}>{renderUserForm(true)}</Modal>
      )}
      {showArchiveModal && selectedUser && (
        <Modal title="Archive User" onClose={() => setShowArchiveModal(false)}>
          <p className="text-sm text-text-secondary mb-4">
            Are you sure you want to archive <strong>{selectedUser.firstName} {selectedUser.lastName}</strong>? This user will be moved to the archive.
          </p>
          {formError && <div className="rounded-lg bg-accent-red/10 border border-accent-red/30 px-3 py-2 text-sm text-accent-red mb-3">{formError}</div>}
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowArchiveModal(false)} className="px-4 py-2 border border-input-border rounded-lg text-sm text-text-primary hover:opacity-80 transition">Cancel</button>
            <button onClick={confirmArchive} disabled={archiveUser.isPending} className="px-4 py-2 bg-accent-red text-white rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-60">
              {archiveUser.isPending ? 'Archiving...' : 'Yes, Archive'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
