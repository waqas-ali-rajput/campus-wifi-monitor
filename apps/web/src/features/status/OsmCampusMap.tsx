import { useEffect, useMemo, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { Copy, MapPin } from 'lucide-react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LocationDTO, LocationStatus } from '@campus/shared';
import { MUET_CAMPUS, STATUS_COLORS, STATUS_LABELS } from '@campus/shared';
import { fmtAgo, fmtMbps, fmtMs } from '../../lib/format';
import { Button } from '../../components/ui';

function FitPins({ locations }: { locations: LocationDTO[] }) {
  const map = useMap();
  const points = useMemo(() => locations.flatMap((l) => l.latitude != null && l.longitude != null ? [[l.latitude, l.longitude] as [number, number]] : []), [locations]);
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [32, 32], maxZoom: 18 });
    else map.setView([MUET_CAMPUS.latitude, MUET_CAMPUS.longitude], 16);
  }, [map, points]);
  return null;
}

export function OsmCampusMap({ locations, onSelect }: { locations: LocationDTO[]; onSelect: (location: LocationDTO) => void }) {
  const [tileError, setTileError] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const pinned = locations.filter((location) => location.latitude != null && location.longitude != null);
  const unpinned = locations.filter((location) => location.latitude == null || location.longitude == null);

  return (
    <div>
      <div className="relative h-[min(68vh,680px)] min-h-[360px] overflow-hidden rounded-lg border border-line">
        <MapContainer center={[MUET_CAMPUS.latitude, MUET_CAMPUS.longitude]} zoom={16} scrollWheelZoom className="h-full w-full" aria-label="OpenStreetMap campus locations">
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
            eventHandlers={{ tileerror: () => setTileError(true), tileload: () => setTileError(false) }}
          />
          <FitPins locations={pinned} />
          {pinned.map((location) => {
            const color = STATUS_COLORS[location.current_status];
            return <CircleMarker
              key={location.location_id}
              center={[location.latitude!, location.longitude!]}
              radius={location.current_status === 'critical' || location.active_outage ? 11 : 8}
              pathOptions={{ color: '#fff', weight: 2, fillColor: location.active_maintenance ? '#eda100' : color, fillOpacity: 0.95 }}
              bubblingMouseEvents={false}
              eventHandlers={{ click: () => onSelect(location) }}
            >
              <Popup minWidth={220}>
                <div className="space-y-2">
                  <div>
                    <strong>{location.location_name}</strong>
                    <div>{location.building}{location.floor != null ? ` · Floor ${location.floor}` : ''}</div>
                  </div>
                  <div className="font-medium" style={{ color }}>{STATUS_LABELS[location.current_status]}{location.current_score != null ? ` · ${Math.round(location.current_score)}` : ''}</div>
                  <div className="grid grid-cols-2 gap-x-3 text-sm"><span>Avg download</span><span>{fmtMbps(location.today.avg_download)} Mbps</span><span>Avg ping</span><span>{fmtMs(location.today.avg_ping)} ms</span><span>Tests today</span><span>{location.today.tests}</span></div>
                  {location.active_outage && <div className="font-medium text-red-700">Outage active</div>}
                  {location.active_maintenance && <div className="font-medium text-amber-700">Maintenance in progress</div>}
                  <div className="text-xs text-gray-600">{location.latitude}, {location.longitude} · Last tested {fmtAgo(location.last_tested_at)}</div>
                  <Button size="sm" onClick={() => onSelect(location)}>Open location</Button>
                </div>
              </Popup>
            </CircleMarker>;
          })}
        </MapContainer>
        {tileError && <div className="absolute inset-x-3 top-3 z-[1000] rounded-lg border border-[#e9cf83] bg-[#fff8e5] px-3 py-2 text-sm text-[#674f0b]" role="status">Map tiles could not load. Location status remains available in grid view.</div>}
      </div>
      {tileError && <div className="mt-3 rounded-lg border border-line bg-white p-3" role="region" aria-label="Campus locations without map tiles">
        <p className="mb-2 text-[13px] font-medium text-ink">Campus location status</p>
        <div className="grid gap-1 sm:grid-cols-2">{locations.map((location) => <button type="button" key={location.location_id} onClick={() => onSelect(location)} className="flex min-h-11 items-center justify-between gap-2 rounded-md px-2 text-left hover:bg-paper focus-visible:outline focus-visible:outline-2">
          <span className="inline-flex min-w-0 items-center gap-2"><MapPin className="h-4 w-4 shrink-0" style={{ color: STATUS_COLORS[location.current_status] }} /><span className="truncate">{location.location_name}</span></span>
          <span className="whitespace-nowrap text-[12px]">{STATUS_LABELS[location.current_status]}{location.current_score != null ? ` · ${Math.round(location.current_score)}` : ''}</span>
        </button>)}</div>
      </div>}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
        <span>{pinned.length} pinned location{pinned.length === 1 ? '' : 's'} · {unpinned.length} not yet pinned</span>
        <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer" className="text-accent hover:underline">Report a map issue</a>
      </div>
      <details className="mt-2 text-[12.5px] text-ink-3">
        <summary className="cursor-pointer">Verified coordinates ({pinned.length})</summary>
        <ul className="mt-1 divide-y divide-line rounded-lg border border-line bg-white">
          {pinned.map((location) => <li key={location.location_id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <button type="button" className="inline-flex min-h-11 flex-1 items-center gap-2 text-left text-ink hover:text-accent focus-visible:outline focus-visible:outline-2" onClick={() => onSelect(location)}>
              <MapPin className="h-4 w-4 shrink-0" style={{ color: STATUS_COLORS[location.current_status] }} />
              <span className="min-w-0 flex-1 truncate">{location.location_name} · {location.building}</span>
              <span className="num whitespace-nowrap">{location.latitude}, {location.longitude}</span>
            </button>
            <button type="button" className="grid min-h-11 min-w-11 place-items-center rounded-md hover:bg-paper focus-visible:outline focus-visible:outline-2" aria-label={`Copy coordinates for ${location.location_name}`} onClick={async () => { await navigator.clipboard.writeText(`${location.latitude}, ${location.longitude}`); setCopiedId(location.location_id); }}>
              <Copy className="h-4 w-4" />
            </button>
            {copiedId === location.location_id && <span role="status" className="basis-full text-right text-[11px]">Coordinates copied</span>}
          </li>)}
          {pinned.length === 0 && <li className="px-3 py-2">No verified coordinates have been entered yet.</li>}
        </ul>
      </details>
      {unpinned.length > 0 && <details className="mt-2 text-[12.5px] text-ink-3">
        <summary className="cursor-pointer">Locations awaiting verified coordinates ({unpinned.length})</summary>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{unpinned.map((location) => <li key={location.location_id}>{location.location_name}</li>)}</ul>
      </details>}
    </div>
  );
}
