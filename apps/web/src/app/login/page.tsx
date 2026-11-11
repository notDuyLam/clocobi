'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Spinner } from '@/components/ui';
import { ApiError, login, refresh } from '@/lib/api';

// Only same-site paths, so ?next= cannot send the user elsewhere.
function nextPath() {
  const next = new URLSearchParams(window.location.search).get('next');
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/wardrobe';
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Still logged in (valid refresh cookie)? Skip the form.
  useEffect(() => {
    refresh().then((ok) => ok && router.replace(nextPath()));
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace(nextPath());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div className="fade-in">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-2xl font-black text-[var(--on-accent)]" aria-hidden="true">C</div>
        <h1 className="text-3xl font-bold">Clocobi</h1>
        <p className="mt-1 mb-8 text-muted">Your wardrobe, styled by AI.</p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <div className="banner banner-err fade-in" role="alert">{error}</div>}
          <button className="btn mt-2" disabled={busy}>{busy ? <Spinner /> : 'Log in'}</button>
        </form>
      </div>
    </main>
  );
}
