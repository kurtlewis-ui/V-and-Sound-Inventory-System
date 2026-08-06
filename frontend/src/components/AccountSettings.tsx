'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Loader2, Save, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useMe, useUpdateProfile, useChangeOwnPassword } from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { getApiErrorMessage } from '@/lib/api';
import { fileToResizedDataUrl } from '@/lib/image';

/**
 * Account settings (profile + change password). Shared by the admin dashboard
 * and the staff portal so both have the exact same account experience.
 */
export default function AccountSettings() {
  const router = useRouter();
  const { data: me, isLoading } = useMe();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangeOwnPassword();
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);

  // Profile form
  const [firstName, setFirstName] = useState('');
  const [middleInitial, setMiddleInitial] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileOk, setProfileOk] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState<string | null>(null);

  useEffect(() => {
    if (me) {
      setFirstName(me.firstName ?? '');
      setMiddleInitial(me.middleInitial ?? '');
      setLastName(me.lastName ?? '');
      setEmail(me.email ?? '');
      setAvatarUrl(me.avatarUrl ?? null);
    }
  }, [me]);

  async function onPickPhoto(file?: File) {
    if (!file) return;
    setProfileError(null);
    try {
      const dataUrl = await fileToResizedDataUrl(file, 256, 0.85);
      setAvatarUrl(dataUrl);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Could not process image.');
    }
  }

  async function saveProfile() {
    setProfileError(null);
    setProfileOk(null);
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setProfileError('First name, last name and email are required.');
      return;
    }
    try {
      const updated = await updateProfile.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        middleInitial: middleInitial.trim(),
        email: email.trim(),
        avatarUrl: avatarUrl ?? '',
      });
      updateUser({
        firstName: updated.firstName,
        lastName: updated.lastName,
        middleInitial: updated.middleInitial,
        email: updated.email,
        avatarUrl: updated.avatarUrl,
      });
      setProfileOk('Profile updated.');
    } catch (e) {
      setProfileError(getApiErrorMessage(e));
    }
  }

  async function savePassword() {
    setPwError(null);
    setPwOk(null);
    if (!currentPassword || !newPassword) {
      setPwError('Fill in your current and new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword, confirmPassword });
      setPwOk('Password changed. Please log in again with your new password.');
      // The server invalidates all sessions on password change, so send the
      // user back to login after a short moment.
      setTimeout(() => {
        logout();
        router.replace('/login');
      }, 1500);
    } catch (e) {
      setPwError(getApiErrorMessage(e));
    }
  }

  const initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-text-primary">Settings</h1>

      {isLoading ? (
        <div className="text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading…</div>
      ) : (
        <>
          {/* Profile */}
          <div className="bg-card-bg border border-card-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-text-primary">Profile</h2>

            <div className="flex items-center gap-4">
              <div className="relative">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="avatar" className="w-20 h-20 rounded-full object-cover border border-card-border" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-white text-xl font-bold border border-card-border">{initials}</div>
                )}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -right-1 bg-btn-primary text-btn-primary-text rounded-full p-1.5 shadow hover:opacity-90"
                  title="Change photo"
                >
                  <Camera size={14} />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickPhoto(e.target.files?.[0])} />
              </div>
              <div className="text-sm text-text-secondary">
                <p className="font-medium text-text-primary">{me?.role?.name}</p>
                <p>Click the camera to change your photo.</p>
                {avatarUrl && (
                  <button onClick={() => setAvatarUrl(null)} className="text-accent-red hover:underline text-xs mt-1">Remove photo</button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-sm font-medium text-text-primary mb-1">First Name</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">M.I.</label>
                <input value={middleInitial} maxLength={2} onChange={(e) => setMiddleInitial(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Last Name</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
            </div>

            {profileError && <p className="text-sm text-accent-red">{profileError}</p>}
            {profileOk && <p className="text-sm text-accent-green">{profileOk}</p>}

            <div className="flex justify-end">
              <button onClick={saveProfile} disabled={updateProfile.isPending} className="flex items-center gap-2 btn-grad px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
                <Save size={15} /> {updateProfile.isPending ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          </div>

          {/* Password */}
          <div className="bg-card-bg border border-card-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><KeyRound size={18} /> Change Password</h2>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Current Password</label>
              <input type={showPw ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">New Password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus pr-10" />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Confirm New Password</label>
                <input type={showPw ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
              </div>
            </div>

            {pwError && <p className="text-sm text-accent-red">{pwError}</p>}
            {pwOk && <p className="text-sm text-accent-green">{pwOk}</p>}

            <div className="flex justify-end">
              <button onClick={savePassword} disabled={changePassword.isPending} className="flex items-center gap-2 bg-btn-primary text-btn-primary-text px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60">
                <KeyRound size={15} /> {changePassword.isPending ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
