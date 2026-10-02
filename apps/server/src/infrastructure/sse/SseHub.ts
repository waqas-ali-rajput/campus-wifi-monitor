import type { Response } from 'express';
import type { Role } from '@campus/shared';
import type { EventPublisher, Audience } from '../../shared/ports';

interface Conn {
  id: number;
  userId: string;
  role: Role;
  res: Response;
}

/** Server-Sent Events hub (§11.4). Connections stored by user and role. */
export class SseHub implements EventPublisher {
  private conns = new Map<number, Conn>();
  private seq = 0;
  private heartbeat: NodeJS.Timeout;

  constructor() {
    this.heartbeat = setInterval(() => {
      for (const c of this.conns.values()) c.res.write(`: ping ${Date.now()}\n\n`);
    }, 25000);
    this.heartbeat.unref();
  }

  add(userId: string, role: Role, res: Response): () => void {
    const id = ++this.seq;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 3000\n\n`);
    res.write(`event: hello\ndata: {"ok":true}\n\n`);
    this.conns.set(id, { id, userId, role, res });
    return () => this.conns.delete(id);
  }

  publish(event: string, data: unknown, audience: Audience = { all: true }): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of this.conns.values()) {
      const match =
        audience.all ||
        (audience.userIds && audience.userIds.includes(c.userId)) ||
        (audience.roles && audience.roles.includes(c.role));
      if (match) c.res.write(payload);
    }
  }

  get size() {
    return this.conns.size;
  }

  close() {
    clearInterval(this.heartbeat);
    for (const c of this.conns.values()) c.res.end();
    this.conns.clear();
  }
}
