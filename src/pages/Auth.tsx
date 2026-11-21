import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle2, Chrome, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import SafeImage from '../components/SafeImage';
import { auth, db } from '../lib/firebase';
import { APP_MEDIA } from '../assets/media';
import {
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface AuthProps {
  onLogin: () => void;
}

const DEFAULT_USER_DATA = {
  wallet: {
    deposit: 500,
    winnings: 0,
    bonus: 200,
  },
  isKycVerified: false,
  stats: {
    matchesPlayed: 0,
    totalWins: 0,
    totalKills: 0,
    totalWinnings: 0,
  },
};

export default function Auth({ onLogin }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validatePhone = (p: string) => p.length === 10 && /^\d+$/.test(p);

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), ms);
    });
    return Promise.race([promise, timeout]);
  };

  const getReferrerFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('ref');
  };

  const mapAuthError = (code?: string, fallbackMessage?: string) => {
    switch (code) {
      case 'auth/email-already-in-use':
        return 'This email is already registered. Switch to Sign In to log in.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters';
      case 'auth/network-request-failed':
        return 'Network error. Check your internet connection and try again.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address';
      case 'auth/missing-password':
        return 'Please enter your password';
      case 'auth/operation-not-allowed':
        return 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication → Sign-in method → Email/Password). Enable it there or use Continue with Google below.';
      case 'auth/popup-closed-by-user':
        return 'Google sign-in popup was closed before completing';
      case 'auth/cancelled-popup-request':
        return 'Sign-in request was cancelled';
      case 'auth/popup-blocked':
        return 'Popup was blocked by browser. Please allow popups and try again';
      case 'auth/unauthorized-domain':
        return 'This domain is not authorized in Firebase Authentication → Settings → Authorized domains.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a few minutes and try again.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Invalid email or password';
      default:
        return fallbackMessage || 'Authentication failed. Please try again.';
    }
  };

  const handleForgotPassword = async () => {
    setErrors({});
    setSuccessMsg('');
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrors({ email: 'Enter your email' });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setErrors({ email: 'Invalid email format' });
      return;
    }

    setForgotPasswordLoading(true);
    try {
      await withTimeout(
        sendPasswordResetEmail(auth, cleanEmail),
        8000,
        'Request timed out. Please try again.'
      );
      setSuccessMsg('Password reset link sent to your email.');
    } catch (error: any) {
      setErrors({ email: mapAuthError(error?.code, error?.message) });
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setErrors({});
    setSuccessMsg('');

    const cleanEmail = email.trim();
    const cleanUsername = username.trim();

    const newErrors: { [key: string]: string } = {};
    if (!cleanEmail) newErrors.email = 'Email required';
    if (!password) newErrors.password = 'Password required';
    if (password && password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (!isLogin) {
      if (!cleanUsername) newErrors.username = 'Username required';
      if (!phone) newErrors.phone = '10 digit phone required';
      else if (!validatePhone(phone)) newErrors.phone = 'Enter valid 10 digit number';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        try {
          await withTimeout(
            signInWithEmailAndPassword(auth, cleanEmail, password),
            12000,
            'Login taking too long. Check connection.'
          );
          onLogin();
        } catch (error: any) {
          setErrors({ general: mapAuthError(error?.code, error?.message) });
        }
      } else {
        try {
          const userCredential = await withTimeout(
            createUserWithEmailAndPassword(auth, cleanEmail, password),
            12000,
            'Signup taking too long. Check connection.'
          );
          const firebaseUser = userCredential.user;

          // Update Auth displayName immediately
          await updateProfile(firebaseUser, { displayName: cleanUsername }).catch(() => {});
          // Trigger verification email in background (needed for email_verified claims in rules)
          sendEmailVerification(firebaseUser).catch(() => {});

          let deviceId = localStorage.getItem('khel_galli_device_id');
          if (!deviceId) {
            deviceId = Math.random().toString(36).substring(2) + Date.now().toString(36);
            localStorage.setItem('khel_galli_device_id', deviceId);
          }

          const referredBy = getReferrerFromUrl();

          // Always initialize new email-signup docs with base player role/isAdmin=false
          // to satisfy Firestore create security rules before email verification completes;
          // App.tsx automatically resolves Admin/Co-Owner/Staff UI access via identity & invites.
          try {
            await withTimeout(
              setDoc(
                doc(db, 'users', firebaseUser.uid),
                {
                  username: cleanUsername,
                  email: cleanEmail,
                  phone,
                  ...DEFAULT_USER_DATA,
                  role: 'user',
                  isAdmin: false,
                  referredBy: referredBy || null,
                  deviceId,
                  referralClaimed: false,
                  createdAt: serverTimestamp(),
                },
                { merge: true }
              ),
              8000,
              'Profile creation delayed.'
            );
          } catch (fsError) {
            console.warn('Firestore profile creation warning:', fsError);
          }

          setSuccessMsg('Account created! Redirecting to arena...');
          onLogin();
        } catch (error: any) {
          setErrors({ general: mapAuthError(error?.code, error?.message) });
        }
      }
    } catch (err: any) {
      setErrors({ general: err.message || 'Something went wrong' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrors({});
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      onLogin();
    } catch (error: any) {
      setErrors({ general: mapAuthError(error?.code, 'Google login failed.') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F4F8] flex flex-col justify-center px-4 py-10 max-w-md mx-auto">
      <div className="mb-7 flex flex-col items-center text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mb-3.5 w-20 h-20 rounded-[24px] overflow-hidden border border-blue-200/80 shadow-[0_12px_32px_rgba(0,122,255,0.16)] bg-white"
        >
          <SafeImage src={APP_MEDIA.emblem} alt="KINGS RELOAD" className="w-full h-full" />
        </motion.div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          KINGS <span className="text-[#007AFF]">RELOAD</span>
        </h1>
        <p className="text-xs font-medium text-slate-500 mt-1 flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-[#007AFF]" /> Free Fire Esports Arena
        </p>
      </div>

      <div className="bg-white rounded-[28px] border border-slate-200/80 p-6 sm:p-7 shadow-[0_20px_50px_rgba(15,23,42,0.06)] mb-6">
        {/* iOS Segmented Control */}
        <div className="flex mb-6 bg-slate-100 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => {
              setIsLogin(true);
              setErrors({});
              setSuccessMsg('');
            }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
              isLogin ? 'bg-white text-[#007AFF] shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLogin(false);
              setErrors({});
              setSuccessMsg('');
            }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
              !isLogin ? 'bg-white text-[#007AFF] shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Create Account
          </button>
        </div>

        {errors.general && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-rose-600 text-xs font-semibold"
          >
            <AlertCircle size={15} className="shrink-0" />
            <span>{errors.general}</span>
          </motion.div>
        )}

        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-emerald-700 text-xs font-semibold"
          >
            <CheckCircle2 size={15} className="shrink-0" />
            <span>{successMsg}</span>
          </motion.div>
        )}

        <form onSubmit={handleAuth} className="space-y-3.5">
          <AnimatePresence mode="wait">
            {isLogin ? (
              <motion.div
                key="login"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3.5"
              >
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 ml-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="player@example.com"
                    className={`ios-input min-h-[46px] ${errors.email ? 'border-rose-400' : ''}`}
                  />
                  {errors.email && (
                    <span className="text-[11px] text-rose-600 font-semibold ml-1">{errors.email}</span>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 ml-1">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`ios-input min-h-[46px] pr-11 ${errors.password ? 'border-rose-400' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  {errors.password && (
                    <span className="text-[11px] text-rose-600 font-semibold ml-1">{errors.password}</span>
                  )}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={forgotPasswordLoading || loading}
                    className="text-xs font-bold text-[#007AFF] hover:underline disabled:opacity-50"
                  >
                    {forgotPasswordLoading ? 'Sending...' : 'Forgot Password?'}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="signup"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3.5"
              >
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 ml-1">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Your gamer handle"
                    className={`ios-input min-h-[46px] ${errors.username ? 'border-rose-400' : ''}`}
                  />
                  {errors.username && (
                    <span className="text-[11px] text-rose-600 font-semibold ml-1">{errors.username}</span>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 ml-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className={`ios-input min-h-[46px] ${errors.email ? 'border-rose-400' : ''}`}
                  />
                  {errors.email && (
                    <span className="text-[11px] text-rose-600 font-semibold ml-1">{errors.email}</span>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 ml-1">Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10 digit mobile number"
                    className={`ios-input min-h-[46px] ${errors.phone ? 'border-rose-400' : ''}`}
                  />
                  {errors.phone && (
                    <span className="text-[11px] text-rose-600 font-semibold ml-1">{errors.phone}</span>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 ml-1">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className={`ios-input min-h-[46px] pr-11 ${errors.password ? 'border-rose-400' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  {errors.password && (
                    <span className="text-[11px] text-rose-600 font-semibold ml-1">{errors.password}</span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] bg-[#007AFF] hover:bg-[#0066D6] text-white font-bold rounded-2xl mt-2 shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 active:scale-[0.98] transition-all text-sm disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isLogin ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">or</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full min-h-[48px] bg-[#F4F6FA] hover:bg-slate-100 text-slate-900 border border-slate-200 font-bold rounded-2xl flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all text-sm disabled:opacity-50"
        >
          <Chrome size={18} className="text-[#007AFF]" />
          <span>{loading ? 'Processing...' : 'Continue with Google'}</span>
        </button>

        <div className="text-xs text-center mt-5 text-slate-500">
          {isLogin ? 'New to KINGS RELOAD?' : 'Already have an account?'}{' '}
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setIsLogin(!isLogin);
              setErrors({});
              setSuccessMsg('');
            }}
            className="text-[#007AFF] font-bold hover:underline"
          >
            {isLogin ? 'Create Account' : 'Sign In'}
          </button>
        </div>
      </div>

      <p className="text-center text-slate-400 text-[11px] font-medium px-6">
        By continuing, you agree to our FairPlay Rules & Privacy Policy.
      </p>
    </div>
  );
}
