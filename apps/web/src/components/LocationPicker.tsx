import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, MapPin, Search } from 'lucide-react';
import type { LocationDTO } from '@campus/shared';
import { StatusDot, cx } from './ui';

/** Location dropdown grouped by building, searchable, keyboard accessible. */
export function LocationPicker({ locations, value, onChange, id, placeholder = 'Choose where you are' }: { locations: LocationDTO[]; value: string | null; onChange: (id: string) => void; id?: string; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = locations.find((l) => l.location_id === value);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return locations.filter((l) => !s || l.location_name.toLowerCase().includes(s) || l.building.toLowerCase().includes(s));
  }, [locations, q]);
  const groups = useMemo(() => {
    const m = new Map<string, LocationDTO[]>();
    for (const l of filtered) m.set(l.building, [...(m.get(l.building) ?? []), l]);
    return [...m];
  }, [filtered]);

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => {
    if (open) {
      setQ('');
      setHi(Math.max(0, filtered.findIndex((l) => l.location_id === value)));
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (l: LocationDTO) => {
    onChange(l.location_id);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-left hover:border-ink-4 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      >
        <MapPin className="h-5 w-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          {selected ? (
            <>
              <span className="block truncate font-medium">{selected.location_name}</span>
              <span className="block truncate text-[12.5px] text-ink-3">
                {selected.building}
                {selected.floor != null ? ` · Floor ${selected.floor}` : ''}
              </span>
            </>
          ) : (
            <span className="text-ink-3">{placeholder}</span>
          )}
        </span>
        {selected && <StatusDot status={selected.current_status} />}
        <ChevronDown className={cx('h-4 w-4 text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 animate-rise overflow-hidden rounded-xl border border-line bg-white shadow-pop">
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="h-4 w-4 text-ink-4" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setHi(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') (e.preventDefault(), setHi((h) => Math.min(filtered.length - 1, h + 1)));
                else if (e.key === 'ArrowUp') (e.preventDefault(), setHi((h) => Math.max(0, h - 1)));
                else if (e.key === 'Enter' && filtered[hi]) (e.preventDefault(), choose(filtered[hi]!));
                else if (e.key === 'Escape') setOpen(false);
              }}
              placeholder="Search building or room"
              className="h-11 w-full bg-transparent text-[15px] outline-none"
              aria-label="Search locations"
            />
          </div>
          <ul role="listbox" className="max-h-[320px] overflow-y-auto py-1">
            {groups.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-3">No location matches “{q}”.</li>}
            {groups.map(([b, ls]) => (
              <li key={b}>
                <div className="px-3.5 pb-1 pt-2 text-[12px] font-medium text-ink-4">{b}</div>
                <ul>
                  {ls.map((l) => {
                    const idx = filtered.indexOf(l);
                    return (
                      <li
                        key={l.location_id}
                        role="option"
                        aria-selected={l.location_id === value}
                        onMouseEnter={() => setHi(idx)}
                        onClick={() => choose(l)}
                        className={cx('flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-[14.5px]', idx === hi && 'bg-accent-soft/60')}
                      >
                        <StatusDot status={l.current_status} />
                        <span className="flex-1">{l.location_name}</span>
                        {l.active_outage && <span className="text-[12px] font-medium text-st-critical">Outage</span>}
                        {l.location_id === value && <Check className="h-4 w-4 text-accent" />}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
