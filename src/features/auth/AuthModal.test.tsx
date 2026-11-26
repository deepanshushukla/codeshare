import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthModal from './AuthModal';
import {
  signUpWithEmail, verifySignupOtp, loginWithPassword,
  requestPasswordReset, verifyPasswordResetOtp, setNewPassword,
  resetSupabaseMock,
} from '../../test/supabaseMock';

vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

describe('AuthModal', () => {
  test('login: submitting email+password calls loginWithPassword and onSuccess', async () => {
    const onSuccess = vi.fn();
    render(<AuthModal open onOpenChange={() => {}} initialMode="login" onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(loginWithPassword).toHaveBeenCalledWith('a@b.com', 'secret123');
    expect(onSuccess).toHaveBeenCalled();
  });

  test('login: a rejected loginWithPassword shows its error message and does not call onSuccess', async () => {
    loginWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    const onSuccess = vi.fn();
    render(<AuthModal open onOpenChange={() => {}} initialMode="login" onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByText(/invalid login credentials/i)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('signup: email+password then a correct OTP calls signUpWithEmail, verifySignupOtp, and onSuccess', async () => {
    const onSuccess = vi.fn();
    render(<AuthModal open onOpenChange={() => {}} initialMode="signup" onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText(/email/i), 'new@b.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));
    expect(signUpWithEmail).toHaveBeenCalledWith('new@b.com', 'secret123');
    await userEvent.type(await screen.findByLabelText(/code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(verifySignupOtp).toHaveBeenCalledWith('new@b.com', '123456');
    expect(onSuccess).toHaveBeenCalled();
  });

  test('signup: a wrong OTP shows an error and lets the user retry without closing', async () => {
    verifySignupOtp.mockResolvedValueOnce({ error: { message: 'Token has expired or is invalid' } });
    render(<AuthModal open onOpenChange={() => {}} initialMode="signup" />);
    await userEvent.type(screen.getByLabelText(/email/i), 'new@b.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));
    await userEvent.type(await screen.findByLabelText(/code/i), '000000');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(await screen.findByText(/token has expired or is invalid/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/code/i)).toBeInTheDocument();
  });

  test('forgot password: email, then code+new password calls requestPasswordReset, verifyPasswordResetOtp, setNewPassword, and onSuccess', async () => {
    const onSuccess = vi.fn();
    render(<AuthModal open onOpenChange={() => {}} initialMode="login" onSuccess={onSuccess} />);
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com');
    await userEvent.click(screen.getByRole('button', { name: /send code/i }));
    expect(requestPasswordReset).toHaveBeenCalledWith('a@b.com');
    await userEvent.type(await screen.findByLabelText(/code/i), '123456');
    await userEvent.type(screen.getByLabelText(/new password/i), 'newsecret123');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));
    expect(verifyPasswordResetOtp).toHaveBeenCalledWith('a@b.com', '123456');
    expect(setNewPassword).toHaveBeenCalledWith('newsecret123');
    expect(onSuccess).toHaveBeenCalled();
  });
});
