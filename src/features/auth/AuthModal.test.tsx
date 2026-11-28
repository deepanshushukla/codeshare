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
    expect(loginWithPassword).toHaveBeenCalledWith('a@b.com', 'secret123', { makePrivateRoomId: undefined });
    expect(onSuccess).toHaveBeenCalled();
  });

  test('login from a room\'s Private switch hands that room over and reports which rooms moved', async () => {
    loginWithPassword.mockResolvedValueOnce({ error: null, claimedRoomIds: ['room1'] });
    const onSuccess = vi.fn();
    render(<AuthModal open onOpenChange={() => {}} initialMode="login" onSuccess={onSuccess} makePrivateRoomId="room1" />);
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(loginWithPassword).toHaveBeenCalledWith('a@b.com', 'secret123', { makePrivateRoomId: 'room1' });
    expect(onSuccess).toHaveBeenCalledWith('login', { claimedRoomIds: ['room1'] });
  });

  test('login: a rejected loginWithPassword shows its error message and does not call onSuccess', async () => {
    loginWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' }, claimedRoomIds: [] });
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
  test('login: links to signup for visitors without an account, and signup links back', async () => {
    render(<AuthModal open onOpenChange={() => {}} initialMode="login" />);
    await userEvent.click(screen.getByRole('button', { name: /create an account/i }));
    expect(screen.getByRole('heading', { name: /sign up/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign up$/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /already have an account/i }));
    expect(screen.getByRole('heading', { name: /log in/i })).toBeInTheDocument();
  });
  test('onSuccess reports which flow finished, so callers can tell a signup from a login', async () => {
    const onSuccess = vi.fn();
    const { unmount } = render(<AuthModal open onOpenChange={() => {}} initialMode="signup" onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText(/email/i), 'new@b.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /^sign up$/i }));
    await userEvent.type(await screen.findByLabelText(/code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(onSuccess).toHaveBeenLastCalledWith('signup');
    unmount();

    render(<AuthModal open onOpenChange={() => {}} initialMode="login" onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /^log in$/i }));
    expect(onSuccess).toHaveBeenLastCalledWith('login', { claimedRoomIds: [] });
  });
  test('signup code step: "Resend code" sends a fresh code and says so', async () => {
    render(<AuthModal open onOpenChange={() => {}} initialMode="signup" />);
    await userEvent.type(screen.getByLabelText(/email/i), 'new@b.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /^sign up$/i }));
    await screen.findByLabelText(/code/i);
    await userEvent.click(screen.getByRole('button', { name: /resend code/i }));
    expect(signUpWithEmail).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/new code sent to new@b\.com/i)).toBeInTheDocument();
  });

  test('reset code step: "Resend code" requests another reset code', async () => {
    render(<AuthModal open onOpenChange={() => {}} initialMode="login" />);
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com');
    await userEvent.click(screen.getByRole('button', { name: /send code/i }));
    await screen.findByLabelText(/new password/i);
    await userEvent.click(screen.getByRole('button', { name: /resend code/i }));
    expect(requestPasswordReset).toHaveBeenCalledTimes(2);
  });

  test('in local development, the code step says where the email actually went', async () => {
    render(<AuthModal open onOpenChange={() => {}} initialMode="signup" />);
    await userEvent.type(screen.getByLabelText(/email/i), 'new@b.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /^sign up$/i }));
    await screen.findByLabelText(/code/i);
    expect(screen.getByText(/127\.0\.0\.1:54324/)).toBeInTheDocument();
  });
});
