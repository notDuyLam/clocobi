'use client';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { setCached } from '@/lib/store';
import { toast } from '@/lib/toast';
import type { Occasion } from '@/lib/types';
import { ErrorBox, Spinner } from './ui';

// Create (no occasion) or edit an occasion.
export function OccasionForm({ occasion, onDone }: { occasion?: Occasion; onDone: () => void }) {
  const [name, setName] = useState(occasion?.name ?? '');
  const [description, setDescription] = useState(occasion?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await api<Occasion>(occasion ? `/occasions/${occasion.id}` : '/occasions', {
        method: occasion ? 'PATCH' : 'POST',
        body: { name, description },
      });
      setCached<{ occasions: Occasion[] }>('/occasions', (o) =>
        o && { occasions: occasion ? o.occasions.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...o.occasions] },
      );
      toast(occasion ? 'Occasion updated' : 'Occasion created');
      onDone();
    } catch (err) {
      setError(err as ApiError);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card fade-in flex flex-col gap-3 p-4">
      <label className="field">
        <span>Name</span>
        <input className="input" required maxLength={60} autoFocus placeholder="e.g. Wedding guest" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea className="input" required maxLength={300} placeholder="Where, when, indoors or outside, dress code…" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {error && <ErrorBox error={error} />}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn btn-sec" onClick={onDone} disabled={busy}>Cancel</button>
        <button className="btn" disabled={busy}>{busy ? <Spinner /> : occasion ? 'Save' : 'Create'}</button>
      </div>
    </form>
  );
}
