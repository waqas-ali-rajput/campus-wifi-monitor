import { useQuery } from '@tanstack/react-query';
import { Copy, Smartphone } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Card, PageHeader, QueryState } from '../../components/ui';
import { pushToast } from '../notifications/Toasts';

export function ServerInfoPage() {
  const q = useQuery({ queryKey: ['admin', 'server'], queryFn: () => api<{ urls: Array<{ url: string; qr: string }>; tz: string; sseClients: number; llm: boolean }>('/admin/server-info') });
  return (
    <>
      <PageHeader title="Share on campus Wi-Fi" subtitle="Phones and laptops on the same network can open the app with these addresses and test their own connection." />
      <QueryState q={q}>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {q.data?.urls.map((u) => (
            <Card key={u.url}>
              <img src={u.qr} alt={`QR code for ${u.url}`} className="mx-auto h-[200px] w-[200px] rounded-lg border border-line" />
              <div className="mt-3 flex items-center justify-center gap-2">
                <Smartphone className="h-4 w-4 text-ink-3" />
                <code className="text-[14px] font-medium">{u.url}</code>
              </div>
              <Button size="sm" variant="ghost" className="mx-auto mt-2 flex" icon={<Copy className="h-4 w-4" />} onClick={() => { navigator.clipboard?.writeText(u.url); pushToast({ title: 'Address copied', tone: 'ok' }); }}>Copy address</Button>
            </Card>
          ))}
          <Card title="Server">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-3">Campus timezone</dt><dd>{q.data?.tz}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-3">Live connections</dt><dd className="num">{q.data?.sseClients}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-3">Local LLM rewording</dt><dd>{q.data?.llm ? 'On (Ollama)' : 'Off'}</dd></div>
            </dl>
          </Card>
        </div>
      </QueryState>
    </>
  );
}
