import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  signUpWithEmail,
  verifySignupOtp,
  loginWithPassword,
  requestPasswordReset,
  verifyPasswordResetOtp,
  setNewPassword as setNewPasswordRequest,
} from '../../lib/supabase';
import styles from './AuthModal.module.scss';

type Mode = 'login' | 'signup' | 'forgot';
type Step = 'form' | 'otp' | 'reset';

export type AuthModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: 'login' | 'signup';
  onSuccess?: () => void;
};

/**
 * One modal covering three auth flows -- log in, sign up (with OTP email
 * verification), and forgot/reset password (also OTP-based) -- all against
 * the thin wrappers in `lib/supabase.ts`. Follows `ThemeDrawer`'s controlled
 * Dialog.Root/Portal/Content convention, adapted to this component's own
 * `open`/`onOpenChange` prop pair (its locked interface -- see the task
 * brief -- since `AccessDenied`, `AccountMenu`, and `Landing` all render it).
 *
 * `mode` picks the flow (seeded from `initialMode`; `'forgot'` is reached
 * only via the in-modal "Forgot password?" link, never via the prop) and
 * `step` picks where within that flow the user is. Every transition between
 * steps clears `errorMessage` so a stale error from a previous step never
 * lingers; an error on the *current* step's submit sets it and leaves
 * `mode`/`step` untouched, so the user retries in place rather than bouncing
 * back to the first step.
 */
export default function AuthModal({ open, onOpenChange, initialMode = 'login', onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fieldId = useId();

  // Reopening the modal (without a full remount -- consumers hold it mounted
  // and just flip `open`, same as ThemeDrawer's callers) starts the chosen
  // flow fresh rather than resuming wherever a previous session left off
  // (mid-OTP, a stale error, typed-but-abandoned fields).
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setMode(initialMode);
      setStep('form');
      setEmail('');
      setPassword('');
      setCode('');
      setNewPassword('');
      setErrorMessage(null);
    }
    wasOpen.current = open;
  }, [open, initialMode]);

  function goToForgotPassword(): void {
    setErrorMessage(null);
    setMode('forgot');
    setStep('form');
  }

  function backToLogin(): void {
    setErrorMessage(null);
    setMode('login');
    setStep('form');
  }

  async function handleLoginSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    const { error } = await loginWithPassword(email, password);
    setSubmitting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    onSuccess?.();
    onOpenChange(false);
  }

  async function handleSignupSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    const { error } = await signUpWithEmail(email, password);
    setSubmitting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setStep('otp');
  }

  async function handleVerifySignupOtp(event: FormEvent): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    const { error } = await verifySignupOtp(email, code);
    setSubmitting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    onSuccess?.();
    onOpenChange(false);
  }

  async function handleRequestPasswordReset(event: FormEvent): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    const { error } = await requestPasswordReset(email);
    setSubmitting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setStep('reset');
  }

  async function handleResetPassword(event: FormEvent): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    const { error: otpError } = await verifyPasswordResetOtp(email, code);
    if (otpError) {
      setSubmitting(false);
      setErrorMessage(otpError.message);
      return;
    }
    const { error: passwordError } = await setNewPasswordRequest(newPassword);
    setSubmitting(false);
    if (passwordError) {
      setErrorMessage(passwordError.message);
      return;
    }
    onSuccess?.();
    onOpenChange(false);
  }

  const title =
    mode === 'login' ? 'Log in'
    : mode === 'signup' ? (step === 'otp' ? 'Verify your email' : 'Sign up')
    : step === 'reset' ? 'Reset password'
    : 'Forgot password';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} aria-describedby={undefined}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>{title}</Dialog.Title>
            <Dialog.Close className={styles.close} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' }}>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </Dialog.Close>
          </div>

          {mode === 'login' && (
            <form className={styles.form} onSubmit={handleLoginSubmit}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${fieldId}-email`}>Email</label>
                <input
                  id={`${fieldId}-email`}
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${fieldId}-password`}>Password</label>
                <input
                  id={`${fieldId}-password`}
                  className={styles.input}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              {errorMessage && <p className={styles.error}>{errorMessage}</p>}
              <button type="submit" className={styles.submit} disabled={submitting}>Log in</button>
              <div className={styles.linkRow}>
                <button type="button" className={styles.linkButton} onClick={goToForgotPassword}>Forgot password?</button>
              </div>
            </form>
          )}

          {mode === 'signup' && step === 'form' && (
            <form className={styles.form} onSubmit={handleSignupSubmit}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${fieldId}-email`}>Email</label>
                <input
                  id={`${fieldId}-email`}
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${fieldId}-password`}>Password</label>
                <input
                  id={`${fieldId}-password`}
                  className={styles.input}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              {errorMessage && <p className={styles.error}>{errorMessage}</p>}
              <button type="submit" className={styles.submit} disabled={submitting}>Sign up</button>
            </form>
          )}

          {mode === 'signup' && step === 'otp' && (
            <form className={styles.form} onSubmit={handleVerifySignupOtp}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${fieldId}-email`}>Email</label>
                <input id={`${fieldId}-email`} className={styles.input} type="email" value={email} disabled readOnly />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${fieldId}-code`}>Code</label>
                <input
                  id={`${fieldId}-code`}
                  className={styles.input}
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
              </div>
              {errorMessage && <p className={styles.error}>{errorMessage}</p>}
              <button type="submit" className={styles.submit} disabled={submitting}>Verify</button>
            </form>
          )}

          {mode === 'forgot' && step === 'form' && (
            <form className={styles.form} onSubmit={handleRequestPasswordReset}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${fieldId}-email`}>Email</label>
                <input
                  id={`${fieldId}-email`}
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              {errorMessage && <p className={styles.error}>{errorMessage}</p>}
              <button type="submit" className={styles.submit} disabled={submitting}>Send code</button>
              <div className={styles.linkRow}>
                <button type="button" className={styles.linkButton} onClick={backToLogin}>Back to log in</button>
              </div>
            </form>
          )}

          {mode === 'forgot' && step === 'reset' && (
            <form className={styles.form} onSubmit={handleResetPassword}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${fieldId}-code`}>Code</label>
                <input
                  id={`${fieldId}-code`}
                  className={styles.input}
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${fieldId}-new-password`}>New password</label>
                <input
                  id={`${fieldId}-new-password`}
                  className={styles.input}
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </div>
              {errorMessage && <p className={styles.error}>{errorMessage}</p>}
              <button type="submit" className={styles.submit} disabled={submitting}>Reset password</button>
              <div className={styles.linkRow}>
                <button type="button" className={styles.linkButton} onClick={backToLogin}>Back to log in</button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
