import {defineConfig} from '@playwright/test';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const external = process.env.DOGFOOD_TEST_URL;
export default defineConfig({
  testDir: './tests/browser', timeout: 60000, workers: 1,
  use: {baseURL: external || 'http://127.0.0.1:13000', trace: 'retain-on-failure', channel: process.env.PW_CHANNEL},
  webServer: external ? undefined : [
    {command: 'python -B src/dogfood.py', url: 'http://127.0.0.1:18080/health', timeout: 120000,
      env: {HOST:'127.0.0.1', PORT:'18080', DOGFOOD_DEMO_MODE:'1', DOGFOOD_DB:join(tmpdir(), `dogfood-browser-${process.pid}.sqlite3`)}},
    {command: 'npx next dev --hostname 127.0.0.1 --port 13000', url: 'http://127.0.0.1:13000', timeout: 120000,
      env: {DOGFOOD_API_ORIGIN:'http://127.0.0.1:18080', DOGFOOD_NEXT_DIST:'.next-browser'}},
  ],
});
