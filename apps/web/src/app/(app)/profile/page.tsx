'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ErrorBox, Spinner, TopBar } from '@/components/ui';
import { api, ApiError, logout } from '@/lib/api';
import { clearCache, setCached, useQuery } from '@/lib/store';
import { toast } from '@/lib/toast';
import type { Meta, Profile } from '@/lib/types';

export default function ProfilePage() {
  const meta = useQuery<Meta>('/meta');
  const profile = useQuery<Profile>('/profile');
  const router = useRouter();
  const missing = profile.error?.code === 'PROFILE_NOT_FOUND';
  const failed = (profile.error && !missing) || meta.error;

  return (
    <main>
      <TopBar title="Style profile" />
      <div className="fade-in flex flex-col gap-4 p-4">
        <p className="text-muted">The AI uses this to choose outfits. Fields marked * are required before generating.</p>
        {failed ? (
          <ErrorBox error={(profile.error ?? meta.error)!} onRetry={() => { profile.reload(); meta.reload(); }} />
        ) : !meta.data || (profile.loading && !missing) ? (
          <div className="flex justify-center py-10 text-muted"><Spinner /></div>
        ) : (
          <ProfileForm meta={meta.data} initial={profile.data} />
        )}
        <button
          className="btn btn-sec mt-6"
          onClick={async () => {
            await logout();
            clearCache();
            router.replace('/login');
          }}
        >
          Log out
        </button>
      </div>
    </main>
  );
}

function ProfileForm({ meta, initial }: { meta: Meta; initial?: Profile }) {
  const [f, setF] = useState({
    clothingCategory: initial?.clothingCategory ?? '',
    heightCm: initial ? String(initial.heightCm) : '',
    weightKg: initial ? String(initial.weightKg) : '',
    climate: initial?.climate ?? '',
    build: initial?.build ?? '',
    skinUndertone: initial?.skinUndertone ?? '',
    fitPreference: initial?.fitPreference ?? '',
    styles: initial?.preferredStyles.join(', ') ?? '',
    freeNotes: initial?.freeNotes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((old) => ({ ...old, [k]: e.target.value }));
  const bad = new Set((error?.details?.fields as string[] | undefined)?.map((x) => x.split('.')[0]));

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // Comma list -> unique lowercase values (the backend would reject repeats).
    const preferredStyles = [
      ...new Set(f.styles.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)),
    ];
    try {
      const saved = await api<Profile>('/profile', {
        method: 'PUT',
        body: {
          clothingCategory: f.clothingCategory,
          heightCm: Number(f.heightCm),
          weightKg: Number(f.weightKg),
          climate: f.climate,
          build: f.build || null,
          skinUndertone: f.skinUndertone || null,
          fitPreference: f.fitPreference || null,
          preferredStyles,
          freeNotes: f.freeNotes || null,
        },
      });
      setCached('/profile', () => saved);
      toast('Profile saved');
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  const select = (k: 'build' | 'skinUndertone' | 'fitPreference', label: string, options: string[]) => (
    <label className="field">
      <span>{label}</span>
      <select className="input" value={f[k]} onChange={set(k)}>
        <option value="">Not set</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      {!initial && <div className="banner">No profile yet. Fill it in to start generating outfits.</div>}
      <fieldset className="field">
        <span>Clothing category *</span>
        <div className="grid grid-cols-3 overflow-hidden rounded-[10px] border border-line">
          {meta.clothingCategory.map((c) => (
            <button key={c} type="button" aria-pressed={f.clothingCategory === c} onClick={() => setF((o) => ({ ...o, clothingCategory: c }))} className={`min-h-[44px] text-sm transition-colors ${f.clothingCategory === c ? 'bg-accent text-[var(--on-accent)]' : ''}`}>{c}</button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          <span>Height (cm) *</span>
          <input className="input" type="number" inputMode="numeric" min={50} max={250} step={1} required value={f.heightCm} onChange={set('heightCm')} aria-invalid={bad.has('heightCm')} />
        </label>
        <label className="field">
          <span>Weight (kg) *</span>
          <input className="input" type="number" inputMode="decimal" min={20} max={300} step="any" required value={f.weightKg} onChange={set('weightKg')} aria-invalid={bad.has('weightKg')} />
        </label>
      </div>
      <label className="field">
        <span>Climate *</span>
        <input className="input" required maxLength={100} placeholder="e.g. Hot and humid most of the year" value={f.climate} onChange={set('climate')} aria-invalid={bad.has('climate')} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        {select('build', 'Build', meta.build)}
        {select('skinUndertone', 'Skin undertone', meta.skinUndertone)}
      </div>
      {select('fitPreference', 'Fit preference', meta.fitPreference)}
      <label className="field">
        <span>Preferred styles (comma separated, up to 10)</span>
        <input className="input" placeholder="minimal, smart casual" value={f.styles} onChange={set('styles')} aria-invalid={bad.has('preferredStyles')} />
      </label>
      <label className="field">
        <span>Anything else</span>
        <textarea className="input" maxLength={500} placeholder="e.g. I never wear shorts to work" value={f.freeNotes} onChange={set('freeNotes')} />
      </label>
      {error && <ErrorBox error={error} />}
      <button className="btn" disabled={busy || !f.clothingCategory}>{busy ? <Spinner /> : 'Save profile'}</button>
    </form>
  );
}
