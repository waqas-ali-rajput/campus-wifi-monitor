import type { ComplaintType } from '../constants';

/** §9.2 weighted keyword lists. Phrases match at a word start ("disconnect" matches "disconnects"). */
export const KEYWORDS: Record<Exclude<ComplaintType, 'other'>, Array<[string, number]>> = {
  no_internet: [
    ['no internet', 3], ['not connected', 2], ["can't connect", 2], ['cannot connect', 2], ['offline', 2],
    ['no connection', 3], ['internet is down', 3], ['down', 1], ['not working', 2], ['no wifi', 3], ['no wi fi', 3],
  ],
  slow_internet: [
    ['slow', 3], ['loading', 1], ['buffering', 2], ['takes forever', 2], ['very slow', 3], ['speed', 1],
    ['lag', 1], ['crawling', 2], ['mbps', 1], ['download', 1],
  ],
  high_ping: [
    ['ping', 3], ['latency', 3], ['lag', 2], ['delay', 2], ['laggy', 2], ['video call', 1], ['gaming', 1],
    ['high ms', 2], ['zoom', 1], ['freezes', 1],
  ],
  frequent_disconnection: [
    ['disconnect', 3], ['keeps dropping', 3], ['drops', 2], ['every few minutes', 3], ['keeps disconnecting', 3],
    ['logging out', 1], ['reconnect', 2], ['unstable', 2], ['dropping', 2], ['cuts out', 3],
  ],
  weak_signal: [
    ['weak signal', 3], ['low signal', 3], ['signal', 2], ['one bar', 2], ['poor coverage', 3], ['no signal', 2],
    ['dead zone', 3], ['range', 1], ['coverage', 2], ['weak', 2],
  ],
  website_service_unavailable: [
    ['website', 2], ["can't open", 2], ['not loading', 2], ['portal', 2], ['lms', 2], ['email not', 2],
    ['site down', 3], ['dns', 2], ['blocked', 1], ['service unavailable', 3], ['moodle', 2], ['page', 1],
  ],
};

export function normalizeText(s: string): string {
  return ` ${s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

export interface Classification {
  category: ComplaintType;
  confidence: number;
  scores: Record<ComplaintType, number>;
  alternatives: Array<{ category: ComplaintType; confidence: number }>;
}

export function classifyComplaint(text: string): Classification {
  const norm = normalizeText(text);
  const scores = {
    no_internet: 0, slow_internet: 0, high_ping: 0, frequent_disconnection: 0,
    weak_signal: 0, website_service_unavailable: 0, other: 0,
  } as Record<ComplaintType, number>;
  for (const [cat, list] of Object.entries(KEYWORDS) as Array<[ComplaintType, Array<[string, number]>]>) {
    for (const [phrase, w] of list) {
      const p = normalizeText(phrase).trim();
      if (norm.includes(` ${p}`)) scores[cat] += w;
    }
  }
  const ranked = (Object.entries(scores) as Array<[ComplaintType, number]>)
    .filter(([c]) => c !== 'other')
    .sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  const topScore = top![1];
  const secondScore = second?.[1] ?? 0;
  if (topScore < 2) {
    return { category: 'other', confidence: topScore === 0 ? 0.5 : 0.3, scores, alternatives: [] };
  }
  const total = ranked.reduce((s, [, v]) => s + v, 0) + 0.5;
  const confidence = Math.round((topScore / (topScore + secondScore + 0.5)) * 100) / 100;
  const alternatives = ranked
    .slice(1)
    .filter(([, v]) => v > 0)
    .slice(0, 2)
    .map(([category, v]) => ({ category, confidence: Math.round((v / total) * 100) / 100 }));
  return { category: top![0], confidence, scores, alternatives };
}
