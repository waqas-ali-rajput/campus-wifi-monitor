import { MUET_CAMPUS, type InternetTestDTO } from '@campus/shared';
import { newId } from '../../../shared/ports';
import type { Clock } from '../../../shared/time';
import type { InternetTestRepo } from '../infrastructure/InternetTestRepo';

export interface InternetTestInput {
  provider: 'cloudflare';
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  jitter_ms: number;
}

export class InternetTestService {
  constructor(private repo: InternetTestRepo, private clock: Clock) {}

  async submit(userId: string, input: InternetTestInput): Promise<InternetTestDTO> {
    const test: InternetTestDTO = {
      test_id: newId(),
      user_id: userId,
      provider: input.provider,
      campus_name: MUET_CAMPUS.name,
      scope: 'off_campus',
      download_mbps: round2(input.download_mbps),
      upload_mbps: round2(input.upload_mbps),
      ping_ms: round2(input.ping_ms),
      jitter_ms: round2(input.jitter_ms),
      tested_at: this.clock.now().toISOString(),
    };
    await this.repo.insert(test);
    return test;
  }

  list(userId: string, limit = 10): Promise<InternetTestDTO[]> {
    return this.repo.list(userId, limit);
  }
}

const round2 = (x: number) => Math.round(x * 100) / 100;
