import React, { useState } from 'react';
import {
  ChevronLeft,
  User as UserIcon,
  Mail,
  Phone,
  Lock,
  Edit2,
  Check,
  X,
  Loader2,
  Gamepad2,
} from 'lucide-react';
import { Page, User } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useIosFeedback } from '../components/IosFeedback';

interface ProfileDetailsProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function ProfileDetails({ user, onPageChange }: ProfileDetailsProps) {
  const { showToast } = useIosFeedback();
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [phone, setPhone] = useState(user.phone);
  const [ffIgn, setFfIgn] = useState(user.gameIGNs?.freefire || user.ign || '');
  const [bgmiIgn, setBgmiIgn] = useState(user.gameIGNs?.bgmi || '');
  const [codmIgn, setCodmIgn] = useState(user.gameIGNs?.codm || '');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleUpdateProfile = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser?.uid || ''), {
        username,
        phone,
        ign: ffIgn,
        gameIGNs: {
          freefire: ffIgn,
          bgmi: bgmiIgn,
          codm: codmIgn,
        },
      });
      setIsEditing(false);
      showToast('Profile updated!', 'success');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${auth.currentUser?.uid}`);
      showToast('Failed to update profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user.email) return;
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetSent(true);
      showToast('Password reset email sent!', 'success');
      setTimeout(() => setResetSent(false), 5000);
    } catch (e) {
      console.error(e);
      showToast('Failed to send reset email.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-900 pb-28 select-none">
      {/* Frosted iOS Top Header */}
      <header className="sticky top-0 z-30 ios-glass border-b border-slate-200/80">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onPageChange(Page.PROFILE)}
            className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-base font-extrabold text-slate-900">Personal Details</h1>
          {!isEditing ? (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="px-3.5 py-2 bg-[#007AFF] text-white rounded-full text-xs font-bold flex items-center gap-1"
            >
              <Edit2 size={13} />
              <span>Edit</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"
              >
                <X size={16} />
              </button>
              <button
                type="button"
                onClick={handleUpdateProfile}
                disabled={loading}
                className="w-9 h-9 rounded-full bg-[#007AFF] text-white flex items-center justify-center"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} />}
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        {/* Identity Card */}
        <div className="bg-white border border-slate-200/80 rounded-[26px] p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="w-11 h-11 bg-blue-50 text-[#007AFF] rounded-2xl flex items-center justify-center">
              <UserIcon size={22} />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Account Profile</h2>
              <p className="text-xs text-slate-500">Your contact and login details</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1.5">Username</label>
            {isEditing ? (
              <input
                autoFocus
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="ios-input px-4 py-3 text-sm font-semibold"
              />
            ) : (
              <div className="flex items-center gap-2.5 px-4 py-3 bg-[#F4F6FA] border border-slate-200/70 rounded-2xl text-sm font-bold text-slate-800">
                <UserIcon size={15} className="text-[#007AFF]" />
                <span>{user.username}</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1.5">Mobile Number</label>
            {isEditing ? (
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="ios-input px-4 py-3 text-sm font-semibold"
              />
            ) : (
              <div className="flex items-center gap-2.5 px-4 py-3 bg-[#F4F6FA] border border-slate-200/70 rounded-2xl text-sm font-bold text-slate-800">
                <Phone size={15} className="text-[#007AFF]" />
                <span>{user.phone || 'Not linked'}</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1.5">Email Address</label>
            <div className="flex items-center justify-between px-4 py-3 bg-[#F4F6FA] border border-slate-200/70 rounded-2xl">
              <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-600 truncate">
                <Mail size={15} className="text-slate-400 shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
              <Lock size={14} className="text-slate-400 shrink-0" />
            </div>
          </div>
        </div>

        {/* Game IGNs Card */}
        <div className="bg-white border border-slate-200/80 rounded-[26px] p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-blue-50 text-[#007AFF] rounded-xl flex items-center justify-center">
                <Gamepad2 size={18} />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">In-Game Names (IGN)</h3>
                <p className="text-[11px] text-slate-500">Auto-filled when joining matches</p>
              </div>
            </div>
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="text-xs font-bold text-[#007AFF]"
              >
                Edit
              </button>
            )}
          </div>

          {[
            { label: 'Free Fire IGN', value: ffIgn, setter: setFfIgn, placeholder: 'Enter Free Fire IGN' },
            { label: 'BGMI IGN', value: bgmiIgn, setter: setBgmiIgn, placeholder: 'Enter BGMI IGN' },
            { label: 'COD Mobile IGN', value: codmIgn, setter: setCodmIgn, placeholder: 'Enter CODM IGN' },
          ].map((field) => (
            <div key={field.label}>
              <label className="text-xs font-bold text-slate-500 block mb-1.5">{field.label}</label>
              {isEditing ? (
                <input
                  type="text"
                  placeholder={field.placeholder}
                  value={field.value}
                  onChange={(e) => field.setter(e.target.value)}
                  className="ios-input px-4 py-2.5 text-sm font-semibold"
                />
              ) : (
                <div className="px-4 py-2.5 bg-[#F4F6FA] border border-slate-200/70 rounded-2xl text-sm font-bold text-slate-800">
                  {field.value || <span className="text-slate-400 font-medium">Not set</span>}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Security Action */}
        <div className="bg-white border border-slate-200/80 rounded-[26px] p-5 shadow-xs">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3">
            Security
          </h4>
          <button
            type="button"
            onClick={handleResetPassword}
            disabled={loading || resetSent}
            className={`w-full min-h-[48px] text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition-all ${
              resetSent
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-[#F4F6FA] hover:bg-slate-100 text-slate-900 border border-slate-200'
            }`}
          >
            {resetSent ? (
              <>
                <Check size={16} />
                <span>Reset Link Sent to Email</span>
              </>
            ) : (
              <>
                <Lock size={15} className="text-[#007AFF]" />
                <span>Send Password Reset Email</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
