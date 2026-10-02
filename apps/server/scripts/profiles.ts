/** Synthetic network profiles for the demo seeder and simulators (§12.2). Demo data only. */
export interface Profile {
  name: string;
  building: string;
  floor: number;
  description: string;
  map: [number, number];
  down: number;
  up: number;
  ping: number;
  loss: number;
  popularity: number;
  /** multipliers for a local hour */
  factor: (hour: number) => { down: number; up: number; ping: number; loss: number };
  hourWeight: (hour: number) => number;
}

const flat = () => ({ down: 1, up: 1, ping: 1, loss: 1 });
const campusHours = (h: number) => (h >= 8 && h <= 17 ? 1 : h >= 18 && h <= 21 ? 0.35 : h >= 6 && h < 8 ? 0.15 : 0.03);
const busy = (h: number) => (h >= 11 && h <= 14 ? { down: 0.9, up: 0.92, ping: 1.12, loss: 1.15 } : flat());

export const PROFILES: Profile[] = [
  {
    name: 'Computer Lab 1', building: 'Computer Labs', floor: 1, description: 'Ground floor teaching lab, 40 workstations', map: [10, 16],
    down: 42, up: 18, ping: 24, loss: 0.3, popularity: 0.9, factor: busy, hourWeight: campusHours,
  },
  {
    name: 'Computer Lab 2', building: 'Computer Labs', floor: 1, description: 'Ground floor project lab', map: [30, 16],
    down: 36, up: 14, ping: 28, loss: 1, popularity: 0.9, factor: busy, hourWeight: campusHours,
  },
  {
    name: 'Computer Lab 3', building: 'Computer Labs', floor: 2, description: 'First floor lab next to the server room', map: [20, 34],
    down: 28, up: 10, ping: 45, loss: 2, popularity: 0.75, factor: busy, hourWeight: campusHours,
  },
  {
    name: 'Library Floor 1', building: 'Library Block', floor: 1, description: 'Reading hall and issue desk', map: [50, 60],
    down: 24, up: 9, ping: 60, loss: 2, popularity: 0.9,
    factor: (h) => (h >= 12 && h < 14 ? { down: 0.55, up: 0.6, ping: 1.8, loss: 1.6 } : flat()),
    hourWeight: (h) => campusHours(h) * (h >= 12 && h < 14 ? 1.6 : 1),
  },
  {
    // The table's base values describe the lunch-hour peak; outside 12–14 the floor is "Fair".
    name: 'Library Floor 2', building: 'Library Block', floor: 2, description: 'Group study rooms and quiet zone', map: [64, 48],
    down: 6, up: 2, ping: 160, loss: 8, popularity: 1.0,
    factor: (h) => (h >= 12 && h < 14 ? { down: 0.8, up: 0.85, ping: 1.2, loss: 1.25 } : { down: 2.1, up: 2.1, ping: 0.6, loss: 0.5 }),
    hourWeight: (h) => campusHours(h) * (h >= 12 && h < 14 ? 2.5 : 1),
  },
  {
    name: 'Cafeteria', building: 'Cafeteria', floor: 0, description: 'Main food court, outdoor seating covered by two APs', map: [86, 64],
    down: 20, up: 8, ping: 70, loss: 3, popularity: 0.7,
    factor: (h) => (h === 13 ? { down: 0.4, up: 0.45, ping: 2, loss: 2 } : h === 12 || h === 14 ? { down: 0.7, up: 0.75, ping: 1.4, loss: 1.3 } : flat()),
    hourWeight: (h) => campusHours(h) * (h >= 12 && h <= 14 ? 2 : 0.8),
  },
  {
    name: 'Administration Block', building: 'Administration', floor: 1, description: 'Registrar, accounts and admissions offices', map: [84, 16],
    down: 45, up: 20, ping: 20, loss: 0.2, popularity: 0.55, factor: () => flat(), hourWeight: (h) => (h >= 9 && h <= 16 ? 1 : 0.02),
  },
  {
    name: 'Department Building', building: 'Departments', floor: 1, description: 'Faculty offices and seminar rooms', map: [20, 76],
    down: 30, up: 12, ping: 40, loss: 1.5, popularity: 0.75, factor: busy, hourWeight: campusHours,
  },
  {
    name: 'Hostel Block', building: 'Hostel', floor: 1, description: 'Student residence, 3 floors, mesh Wi-Fi', map: [64, 86],
    down: 14, up: 5, ping: 90, loss: 5, popularity: 1.0,
    factor: (h) => (h >= 19 && h <= 23 ? { down: 0.45, up: 0.45, ping: 1.9, loss: 1.8 } : flat()),
    hourWeight: (h) => (h >= 19 && h <= 23 ? 1.5 : h >= 7 && h <= 18 ? 0.35 : h <= 1 ? 0.5 : 0.05),
  },
];

/** Deterministic PRNG so the seed looks the same on every machine. */
export function rng(seed = 20261001) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(1e-9, next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  const poisson = (lambda: number) => {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= next();
    } while (p > L);
    return k - 1;
  };
  const pick = <T>(xs: T[]) => xs[Math.floor(next() * xs.length)]!;
  return { next, normal, poisson, pick };
}

export type Rng = ReturnType<typeof rng>;

/** Realistic metrics: base × time-of-day factor × log-normal noise (±15 %). */
export function sampleMetrics(p: Profile, hour: number, r: Rng, extra?: { down?: number; ping?: number; loss?: number }) {
  const f = p.factor(hour);
  const n = (s = 0.15) => Math.exp(r.normal() * s);
  const download = Math.max(0.3, p.down * f.down * (extra?.down ?? 1) * n());
  const upload = Math.max(0.1, p.up * f.up * (extra?.down ?? 1) * n());
  const ping = Math.max(3, p.ping * f.ping * (extra?.ping ?? 1) * n());
  const loss = Math.min(60, Math.max(0, p.loss * f.loss * (extra?.loss ?? 1) * n(0.35)));
  const jitter = Math.max(0.5, ping * 0.12 * n(0.4));
  return {
    download_mbps: round(download, 2),
    upload_mbps: round(upload, 2),
    ping_ms: round(ping, 1),
    jitter_ms: round(jitter, 1),
    packet_loss_pct: round(loss, 1),
  };
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

export const STUDENT_NAMES = [
  'Ayesha Khan', 'Bilal Ahmed', 'Sara Malik', 'Hamza Raza', 'Fatima Noor', 'Usman Tariq',
  'Zainab Ali', 'Omar Farooq', 'Hira Siddiqui', 'Ali Hassan', 'Maryam Iqbal', 'Daniyal Shah',
];

export const COMPLAINT_TEXT: Record<string, string[]> = {
  slow_internet: [
    'Internet is very slow in the study rooms, pages take forever to load.',
    'YouTube lectures keep buffering, speed is terrible during lunch.',
    'Downloads are crawling, could not submit my assignment on time.',
    'Very slow Wi-Fi again today, around 1 PM.',
  ],
  high_ping: [
    'High ping during video call, my Zoom class keeps freezing.',
    'Latency is huge, everything lags when I open the LMS.',
    'Online quiz was laggy, ping above 200 ms.',
  ],
  frequent_disconnection: [
    'Wi-Fi disconnects every few minutes in Lab 3.',
    'Connection keeps dropping, I have to reconnect again and again.',
    'Unstable Wi-Fi, keeps disconnecting during the practical.',
  ],
  weak_signal: [
    'Weak signal near the back rows, only one bar.',
    'Poor coverage on the third floor corridor, dead zone near the stairs.',
    'Signal is very low in my room after 8 PM.',
  ],
  no_internet: [
    'No internet at all, connected to Wi-Fi but nothing opens.',
    'Cannot connect to the campus Wi-Fi since morning.',
    'Internet is down in the whole block.',
  ],
  website_service_unavailable: [
    'The LMS portal is not loading but other websites work.',
    'University email not opening on campus Wi-Fi.',
  ],
  other: ['The captive portal login page asks me to sign in every hour.'],
};
