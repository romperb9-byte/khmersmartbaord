import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  User,
} from 'firebase/auth';
import { Loader2, Mail, X } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import type { Language } from '../types/whiteboard';
import { t } from '../i18n/translations';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  currentUser: User | null;
}

export const AuthModal: React.FC<AuthModalProps> = ({ open, onClose, lang, currentUser }) => {
  const copy = t(lang);
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!open) return null;

  const handleGoogleSignIn = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (tab === 'login') {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        if (cred.user.emailVerified) {
          onClose();
        } else {
          setInfo(copy.auth.verifyWarning);
        }
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) {
          await updateProfile(cred.user, { displayName: name.trim() });
        }
        await sendEmailVerification(cred.user);
        setInfo(copy.auth.verifyWarning);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      if (msg.includes('operation-not-allowed')) {
        setError(
          lang === 'km'
            ? 'Email/Password មិនទាន់បានបើកនៅក្នុង Firebase Console ទេ។ សូមបើកនៅ Authentication > Sign-in method ឬប្រើ Google Sign-in។'
            : 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication > Sign-in method). You can use Google Sign-in immediately.',
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    setError(null);
    setLoading(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setInfo(lang === 'km' ? 'បានផ្ញើអ៊ីមែលផ្ទៀងផ្ទាត់ម្ដងទៀតហើយ។' : 'Verification email sent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send verification email.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckVerified = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        onClose();
      } else {
        setInfo(copy.auth.verifyWarning);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {copy.auth.title}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy.auth.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {currentUser && !currentUser.emailVerified && (
          <div className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
            <p>{copy.auth.verifyWarning}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleResendVerification}
                className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
              >
                {copy.auth.resendVerify}
              </button>
              <button
                type="button"
                onClick={handleCheckVerified}
                className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200"
              >
                {copy.auth.refreshVerify}
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 space-y-4">
          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleSignIn}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>{copy.auth.googleBtn}</span>
          </button>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
            <span className="mx-3 text-[11px] text-slate-400">OR</span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setError(null);
              }}
              className={`rounded-md py-1.5 text-xs font-medium ${
                tab === 'login'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {copy.auth.emailTab}
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setError(null);
              }}
              className={`rounded-md py-1.5 text-xs font-medium ${
                tab === 'register'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {copy.auth.registerTab}
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
              {info}
            </div>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-3">
            {tab === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {copy.auth.nameLabel}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                {copy.auth.emailLabel}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                {copy.auth.passwordLabel}
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Mail className="h-4 w-4" />
              {tab === 'login' ? copy.auth.submitLogin : copy.auth.submitRegister}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
