import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ConfigService } from '@nestjs/config';
import { resolveJevAuthConfig, createJevFetch, JevClient } from './jev-fetch.service';

describe('JEV Library - Base Auth & Custom Fetch Override Tests', () => {
  beforeEach(() => {
    delete process.env.JEV_USE_BASE_AUTH;
    delete process.env.JEV_USE_BASIC_AUTH;
    delete process.env.USE_BASE_AUTH;
    delete process.env.JEV_AUTH_TYPE;
    delete process.env.JEV_BASE_AUTH_USER;
    delete process.env.JEV_BASE_AUTH_PASS;
    delete process.env.JEV_BASE_AUTH_TOKEN;
    delete process.env.LLM_USE_BASIC_AUTH;
  });

  describe('resolveJevAuthConfig', () => {
    it('should detect Base Auth when JEV_USE_BASE_AUTH is true', () => {
      const configService = new ConfigService({
        JEV_USE_BASE_AUTH: 'true',
        JEV_BASE_AUTH_USER: 'admin',
        JEV_BASE_AUTH_PASS: 'secret123',
      });

      const config = resolveJevAuthConfig(configService);
      assert.strictEqual(config.useBaseAuth, true);
      assert.strictEqual(config.authType, 'basic');
      assert.strictEqual(config.username, 'admin');
      assert.strictEqual(config.password, 'secret123');
    });

    it('should detect Base Auth when JEV_AUTH_TYPE is basic', () => {
      const configService = new ConfigService({
        JEV_AUTH_TYPE: 'basic',
        JEV_BASE_AUTH_USER: 'operator',
        JEV_BASE_AUTH_PASS: 'op_pass',
      });

      const config = resolveJevAuthConfig(configService);
      assert.strictEqual(config.useBaseAuth, true);
      assert.strictEqual(config.authType, 'basic');
      assert.strictEqual(config.username, 'operator');
    });

    it('should respect JEV_USE_BASE_AUTH=false even if credentials exist', () => {
      const configService = new ConfigService({
        JEV_USE_BASE_AUTH: 'false',
        JEV_BASE_AUTH_USER: 'admin',
        JEV_BASE_AUTH_PASS: 'pass',
      });

      const config = resolveJevAuthConfig(configService);
      assert.strictEqual(config.useBaseAuth, false);
    });

    it('should default to useBaseAuth=false when no auth config is set', () => {
      const configService = new ConfigService({});
      const config = resolveJevAuthConfig(configService);
      assert.strictEqual(config.useBaseAuth, false);
    });
  });

  describe('createJevFetch', () => {
    it('should inject Authorization: Basic header when Base Auth is enabled', async () => {
      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;

      const mockFetch: typeof globalThis.fetch = async (input, init) => {
        capturedUrl = input.toString();
        capturedInit = init;
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const customFetch = createJevFetch(
        {
          useBaseAuth: true,
          authType: 'basic',
          username: 'jev-user',
          password: 'jev-password',
        },
        mockFetch,
      );

      const res = await customFetch('https://api.example.com/v1/decide', {
        method: 'POST',
        headers: { 'X-Custom-Header': 'jev-test' },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(capturedUrl, 'https://api.example.com/v1/decide');

      const headers = capturedInit?.headers as Record<string, string>;
      assert.ok(headers);

      const expectedBasic = `Basic ${Buffer.from('jev-user:jev-password').toString('base64')}`;
      assert.strictEqual(headers['authorization'], expectedBasic);
      assert.strictEqual(headers['x-custom-header'], 'jev-test');
    });

    it('should NOT inject Basic Auth when Base Auth is disabled', async () => {
      let capturedInit: RequestInit | undefined;

      const mockFetch: typeof globalThis.fetch = async (input, init) => {
        capturedInit = init;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      };

      const customFetch = createJevFetch(
        {
          useBaseAuth: false,
          authType: 'none',
        },
        mockFetch,
      );

      await customFetch('https://api.example.com/v1/test', {
        headers: { 'Content-Type': 'application/json' },
      });

      const headers = capturedInit?.headers as Record<string, string>;
      assert.strictEqual(headers['authorization'], undefined);
      assert.strictEqual(headers['content-type'], 'application/json');
    });
  });

  describe('JevClient', () => {
    it('should initialize and execute requests with Base Auth', async () => {
      let called = false;
      const expectedBasic = `Basic ${Buffer.from('jev-admin:pve-pass').toString('base64')}`;

      const mockFetch: typeof globalThis.fetch = async (input, init) => {
        called = true;
        const headers = init?.headers as Record<string, string>;
        assert.strictEqual(headers['authorization'], expectedBasic);
        return new Response(JSON.stringify({ answer: 'YES', probability: 0.98 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = new JevClient({
        baseUrl: 'https://gateway.example.com/jev',
        useBaseAuth: true,
        authType: 'basic',
        username: 'jev-admin',
        password: 'pve-pass',
        baseFetch: mockFetch,
      });

      const result = await client.request('/v1/decide', { prompt: 'check' });
      assert.strictEqual(called, true);
      assert.strictEqual(result.answer, 'YES');
      assert.strictEqual(result.probability, 0.98);
    });
  });
});
