'use client';
import { useState } from 'react';
import type { Meta } from '@/lib/types';
import { Chips, toggleIn } from './ui';

export interface Mood {
  likedColors: string[];
  avoidColors: string[];
}
export const NO_MOOD: Mood = { likedColors: [], avoidColors: [] };
const NONE = 'No preference';

export function moodSummary(m: Mood) {
  const parts = [
    m.likedColors.length && `Favour ${m.likedColors.join(', ')}`,
    m.avoidColors.length && `Avoid ${m.avoidColors.join(', ')}`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : NONE;
}

// Per-request color preference for generate (FR-058): a soft hint to the AI, never stored.
export function ColorMood({ meta, mood, onChange }: { meta: Meta; mood: Mood; onChange: (m: Mood) => void }) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);

  const row = (key: keyof Mood, title: string) => {
    const list = mood[key];
    const toggle = (v: string) => onChange({ ...mood, [key]: v === NONE ? [] : toggleIn(list, v) });
    const selected = list.length ? list : [NONE];
    return (
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <Chips label={title} options={[NONE, ...meta.colorGroups]} selected={selected} onToggle={toggle} />
        {more && <Chips label={`${title}: specific colors`} options={meta.colors} selected={list} onToggle={toggle} />}
      </div>
    );
  };

  return (
    <div className="card p-3">
      <button type="button" className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="min-w-0">
          <b>Color mood</b> <span className="text-sm text-muted">(optional, this time only)</span>
          <span className="block truncate text-sm">{moodSummary(mood)}</span>
        </span>
        <span className="shrink-0 text-sm underline">{open ? 'Done' : 'Change'}</span>
      </button>
      {open && (
        <div className="fade-in mt-2 flex flex-col gap-4">
          {row('likedColors', 'Favour')}
          {row('avoidColors', 'Avoid')}
          <button type="button" className="self-start text-sm underline" onClick={() => setMore(!more)}>
            {more ? 'Hide specific colors' : 'Pick specific colors'}
          </button>
          <p className="text-xs text-muted">A hint for the AI, not a filter. It does not change which outfits count as already made.</p>
        </div>
      )}
    </div>
  );
}
