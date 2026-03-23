import { buildServer } from '../server';

describe('buildServer (Fastify + Express)', () => {
  it('boots and closes without listen', async () => {
    const app = await buildServer();
    await app.close();
  });
});
