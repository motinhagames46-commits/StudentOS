import request from 'supertest';
import { afterEach, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { env } from '../src/lib/env.js';

afterEach(() => {
  env.APP_VERSION = '';
});

it('anuncia o commit a correr em cada resposta, para a web saber que está desatualizada', async () => {
  env.APP_VERSION = 'baa85b7';
  expect((await request(app).get('/api/health')).headers['x-app-version']).toBe('baa85b7');
  env.APP_VERSION = '';
  expect((await request(app).get('/api/health')).headers['x-app-version']).toBeUndefined();
});
