'use client';
import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { invalidate, getCached } from '@/lib/store';
import { CATEGORY_LABEL, SLOT_LABEL, itemName, type Item, type ItemAttrs, type Meta } from '@/lib/types';
import { Chips, ErrorBox, Photo, Spinner, toggleIn } from './ui';

export const itemImage = (i: { cleanUrl: string | null; originalUrl: string }) => i.cleanUrl ?? i.originalUrl;

// After any item write: lists, summaries and outfits that show items may be out of date.
export const afterItemChange = () => invalidate('/items', '/outfits', '/occasions/');

// Instant first paint on the details page from any list already in the cache.
export function seedItem(id: string) {
  for (const key of ['/items', '/items?status=DRAFT', '/items?liked=true']) {
    const hit = getCached<{ items: Item[] }>(key)?.items.find((i) => i.id === id);
    if (hit) return hit;
  }
}

export function ItemCard({ item }: { item: Item }) {
  return (
    <Link href={`/items/${item.id}`} className="card block transition-transform active:scale-[0.98]">
      <Photo src={itemImage(item)} alt={itemName(item)} size={400} contain={!!item.cleanUrl} className="aspect-square" />
      <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-sm">
        <span className="truncate">{item.status === 'DRAFT' ? 'Draft item' : itemName(item)}</span>
        {item.status === 'DRAFT' && <span className="badge text-warn">Draft</span>}
      </div>
    </Link>
  );
}

export function ItemGrid({ items }: { items: Item[] }) {
  return (
    <div className="fade-in grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((i) => <ItemCard key={i.id} item={i} />)}
    </div>
  );
}

export interface ItemValues extends ItemAttrs {
  size: string | null;
  brand: string | null;
  notes: string | null;
}

export const EMPTY_VALUES: ItemValues = {
  category: null, subcategory: null, primaryColor: null, secondaryColor: null, pattern: null,
  fabric: null, fit: null, seasons: [], formality: null, aiNote: null, size: null, brand: null, notes: null,
};

// Rule R1 (fields a COMPLETE item needs).
const REQUIRED = ['category', 'primaryColor', 'pattern', 'fabric', 'fit', 'formality'] as const;
export function missingFields(v: ItemValues) {
  const m: string[] = REQUIRED.filter((k) => !v[k]);
  if (!v.seasons.length) m.push('seasons');
  return m;
}

type Text = Exclude<keyof ItemValues, 'seasons' | 'category'>;

export function ItemForm({
  meta,
  initial,
  banner,
  submitLabel,
  draftLabel,
  onSubmit,
  busyText,
}: {
  meta: Meta;
  initial: ItemValues;
  banner?: ReactNode;
  submitLabel: string;
  draftLabel?: string;
  busyText?: string;
  onSubmit: (values: ItemValues, status: 'COMPLETE' | 'DRAFT') => Promise<void>;
}) {
  // Only the form fields: an Item also carries id, status, liked… which PATCH must not resend.
  const [v, setV] = useState(() =>
    Object.fromEntries(Object.keys(EMPTY_VALUES).map((k) => [k, initial[k as keyof ItemValues]])) as unknown as ItemValues,
  );
  const [busy, setBusy] = useState<'COMPLETE' | 'DRAFT' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [shown, setShown] = useState<string[]>([]);
  const bad = new Set([...shown, ...((error?.details?.fields as string[] | undefined) ?? []).map((f) => f.split('.')[0])]);

  const text = (k: Text) => (e: { target: { value: string } }) => setV((o) => ({ ...o, [k]: e.target.value || null }));

  async function submit(status: 'COMPLETE' | 'DRAFT', e?: FormEvent) {
    e?.preventDefault();
    if (status === 'COMPLETE') {
      const m = missingFields(v);
      setShown(m);
      if (m.length) {
        document.getElementById(`f-${m[0]}`)?.focus();
        return;
      }
    }
    setBusy(status);
    setError(null);
    try {
      await onSubmit(v, status);
    } catch (err) {
      setError(err as ApiError);
      setBusy(null);
    }
  }

  const select = (k: Text, label: string, options: string[], req = true, none = 'Choose…') => (
    <label className="field">
      <span>{label}{req && ' *'}</span>
      <select id={`f-${k}`} className="input" value={v[k] ?? ''} onChange={text(k)} aria-invalid={bad.has(k)}>
        <option value="">{none}</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );

  return (
    <form onSubmit={(e) => submit('COMPLETE', e)} className="flex flex-col gap-4">
      {banner}
      <label className="field">
        <span>Category *</span>
        <select id="f-category" className="input" value={v.category ?? ''} aria-invalid={bad.has('category')} onChange={(e) => setV((o) => ({ ...o, category: (e.target.value || null) as ItemValues['category'] }))}>
          <option value="">Choose…</option>
          {meta.categories.map((c) => <option key={c} value={c}>{SLOT_LABEL[c]}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Type</span>
        <input className="input" maxLength={40} placeholder="e.g. polo shirt" value={v.subcategory ?? ''} onChange={text('subcategory')} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        {select('primaryColor', 'Main color', meta.colors)}
        {select('secondaryColor', 'Second color', meta.colors, false, 'None')}
        {select('pattern', 'Pattern', meta.pattern)}
        <label className="field">
          <span>Fabric *</span>
          <input id="f-fabric" className="input" maxLength={40} placeholder="e.g. cotton" value={v.fabric ?? ''} onChange={text('fabric')} aria-invalid={bad.has('fabric')} />
        </label>
        {select('fit', 'Fit', meta.fit)}
        {select('formality', 'Formality', meta.formality)}
      </div>
      <fieldset className="field">
        <span id="f-seasons" tabIndex={-1} className={bad.has('seasons') ? 'text-danger' : ''}>Seasons * (one or more)</span>
        <Chips label="Seasons" options={meta.seasons} selected={v.seasons} onToggle={(s) => setV((o) => ({ ...o, seasons: toggleIn(o.seasons, s) }))} />
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          <span>Size</span>
          <input className="input" maxLength={20} placeholder="e.g. M" value={v.size ?? ''} onChange={text('size')} />
        </label>
        <label className="field">
          <span>Brand</span>
          <input className="input" maxLength={60} value={v.brand ?? ''} onChange={text('brand')} />
        </label>
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea className="input" maxLength={500} value={v.notes ?? ''} onChange={text('notes')} />
      </label>
      {shown.length > 0 && <div className="banner banner-err" role="alert">Fill in the fields marked in red to save, or save as a draft.</div>}
      {error && <ErrorBox error={error} />}
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-bg/95 px-4 pt-3 backdrop-blur-sm" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
        <button className="btn" disabled={!!busy}>{busy === 'COMPLETE' ? <><Spinner />{busyText}</> : submitLabel}</button>
        {draftLabel && (
          <button type="button" className="btn btn-sec" disabled={!!busy} onClick={() => submit('DRAFT')}>
            {busy === 'DRAFT' ? <><Spinner />{busyText}</> : draftLabel}
          </button>
        )}
      </div>
    </form>
  );
}

export function Attr({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2.5">
      <span className="text-muted">{label}</span>
      <span className="text-right">{value || '—'}</span>
    </div>
  );
}

export const categoryLabel = (c: Item['category']) => (c ? SLOT_LABEL[c] : '—');
export { CATEGORY_LABEL };
