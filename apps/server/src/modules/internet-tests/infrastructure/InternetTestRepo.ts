import type { InternetTestDTO } from '@campus/shared';
import type { Db } from '../../../infrastructure/db/connection';

export class InternetTestRepo {
  constructor(private db: Db) {}

  insert(test: InternetTestDTO) {
    this.db.prepare(
      `INSERT INTO internet_tests(test_id, user_id, provider, campus_name, scope, download_mbps, upload_mbps, ping_ms, jitter_ms, tested_at)
       VALUES (@test_id, @user_id, @provider, @campus_name, @scope, @download_mbps, @upload_mbps, @ping_ms, @jitter_ms, @tested_at)`,
    ).run(test);
  }

  list(userId: string, limit = 10): InternetTestDTO[] {
    return this.db.prepare(
      'SELECT test_id, user_id, provider, campus_name, scope, download_mbps, upload_mbps, ping_ms, jitter_ms, tested_at FROM internet_tests WHERE user_id = ? ORDER BY tested_at DESC LIMIT ?',
    ).all(userId, limit) as InternetTestDTO[];
  }
}
