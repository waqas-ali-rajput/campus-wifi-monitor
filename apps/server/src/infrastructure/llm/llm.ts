import type { LlmProvider } from '../../shared/ports';

export class NoopLlmProvider implements LlmProvider {
  readonly enabled = false;
  async rewrite(text: string) {
    return text;
  }
}

/** Optional local LLM (Ollama) used only to reword the template summary. 3 s timeout, falls back to the template. */
export class OllamaProvider implements LlmProvider {
  readonly enabled = true;
  constructor(
    private url: string,
    private model: string,
  ) {}
  async rewrite(text: string): Promise<string> {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 3000);
    try {
      const res = await fetch(`${this.url.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ac.signal,
        body: JSON.stringify({
          model: this.model,
          stream: false,
          prompt: `Rewrite the following network status summary for an IT team in clear, concise English. Rewrite without changing any numbers, names or times. Do not add facts.\n\n${text}`,
        }),
      });
      if (!res.ok) return text;
      const j = (await res.json()) as { response?: string };
      return j.response?.trim() || text;
    } catch {
      return text;
    } finally {
      clearTimeout(t);
    }
  }
}
