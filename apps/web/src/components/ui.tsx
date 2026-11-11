'use client';
/* eslint-disable @next/next/no-img-element -- Cloudinary already serves sized images; next/image would add a second optimizer */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { thumb } from '@/lib/cloudinary';
import { useToast } from '@/lib/toast';
import { IconBack } from './icons';

export function TopBar({
  title,
  back,
  right,
}: {
  title: ReactNode;
  back?: boolean | string;
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-10 flex min-h-[60px] items-center gap-1 border-b border-line bg-bg/90 px-2 backdrop-blur-sm" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {back &&
        (typeof back === 'string' ? (
          <Link href={back} className="icon-btn" aria-label="Back"><IconBack /></Link>
        ) : (
          <button className="icon-btn" aria-label="Back" onClick={() => router.back()}><IconBack /></button>
        ))}
      <h1 className={`min-w-0 flex-1 truncate font-bold ${back ? 'text-[17px]' : 'px-2 text-xl'}`}>{title}</h1>
      {right}
    </header>
  );
}

// Image with a fixed box (no layout shift), lazy decode and a cheap fade-in.
export function Photo({
  src,
  alt,
  size,
  className = '',
  contain,
  eager,
}: {
  src: string;
  alt: string;
  size?: number;
  className?: string;
  contain?: boolean;
  eager?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`overflow-hidden bg-surface ${className}`}>
      <img
        src={size ? thumb(src, size) : src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        data-loaded={loaded}
        onLoad={() => setLoaded(true)}
        ref={(el) => {
          if (el?.complete && !loaded) setLoaded(true);
        }}
        className={`fade-img h-full w-full ${contain ? 'object-contain' : 'object-cover'}`}
      />
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`spinner inline-block ${className}`} role="status" aria-label="Loading" />;
}

export function ErrorBox({ error, onRetry }: { error: ApiError | Error; onRetry?: () => void }) {
  return (
    <div className="banner banner-err fade-in flex items-center justify-between gap-3" role="alert">
      <span>{error.message}</span>
      {onRetry && (
        <button className="btn btn-sm btn-sec shrink-0" onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}

export function Toast() {
  const msg = useToast();
  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div key={msg} className="fade-in rounded-full bg-accent px-4 py-2.5 text-sm text-[var(--on-accent)] shadow-lg" role="status">{msg}</div>
    </div>
  );
}

// Bottom sheet confirm dialog. Escape and the backdrop cancel.
export function Confirm({
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="backdrop absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="sheet relative w-full max-w-md rounded-t-2xl bg-bg p-5 sm:rounded-2xl" style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
        <h2 className="text-lg font-bold">{title}</h2>
        {body && <div className="mt-2 text-muted">{body}</div>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button className="btn btn-sec" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : ''}`} onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? <Spinner /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Chips({
  options,
  selected,
  onToggle,
  label,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" className="chip" aria-pressed={selected.includes(o)} onClick={() => onToggle(o)}>{o}</button>
      ))}
    </div>
  );
}

export const toggleIn = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

export function GridSkeleton({ count = 6, ratio = 'aspect-square' }: { count?: number; ratio?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`skeleton rounded-[var(--radius)] ${ratio}`} />
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="fade-in flex flex-col items-center gap-4 px-6 py-14 text-center text-muted">{children}</div>;
}
