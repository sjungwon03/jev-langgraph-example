import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { JevAuthConfig, JevAuthType, JevClientOptions } from './jev.interface';

const logger = new Logger('JevFetchService');

export interface IConfigReader {
  get<T = any>(key: string): T | undefined;
}

/**
 * Resolves JEV authentication configuration from NestJS ConfigService or process.env.
 * Priority:
 * 1. JEV_USE_BASE_AUTH / JEV_USE_BASIC_AUTH / USE_BASE_AUTH ('true', '1', 'yes')
 * 2. JEV_AUTH_TYPE ('basic', 'bearer', 'none')
 * 3. JEV_BASE_AUTH_USER / JEV_BASIC_AUTH_USERNAME / BASE_AUTH_USER
 * 4. JEV_BASE_AUTH_PASS / JEV_BASIC_AUTH_PASSWORD / BASE_AUTH_PASS
 */
export function resolveJevAuthConfig(configService?: IConfigReader): JevAuthConfig {
  const getVal = (key: string): string => {
    return (configService?.get<string>(key) || process.env[key] || '').trim();
  };

  const useBaseAuthRaw =
    getVal('JEV_USE_BASE_AUTH') ||
    getVal('JEV_USE_BASIC_AUTH') ||
    getVal('USE_BASE_AUTH') ||
    getVal('LLM_USE_BASIC_AUTH');

  const authTypeRaw = (getVal('JEV_AUTH_TYPE') || getVal('LLM_AUTH_TYPE')).toLowerCase();

  const username =
    getVal('JEV_BASE_AUTH_USER') ||
    getVal('JEV_BASIC_AUTH_USER') ||
    getVal('JEV_BASIC_AUTH_USERNAME') ||
    getVal('BASE_AUTH_USER') ||
    getVal('LLM_BASIC_AUTH_USER');

  const password =
    getVal('JEV_BASE_AUTH_PASS') ||
    getVal('JEV_BASIC_AUTH_PASS') ||
    getVal('JEV_BASIC_AUTH_PASSWORD') ||
    getVal('BASE_AUTH_PASS') ||
    getVal('LLM_BASIC_AUTH_PASS');

  const token =
    getVal('JEV_BASE_AUTH_TOKEN') ||
    getVal('JEV_BASIC_AUTH_TOKEN') ||
    getVal('BASE_AUTH_TOKEN');

  // Determine if base auth should be activated
  const isExplicitlyTrue = ['true', '1', 'yes', 'on'].includes(useBaseAuthRaw.toLowerCase());
  const isAuthTypeBasic = authTypeRaw === 'basic';
  const hasCredentials = Boolean(username && password) || Boolean(token);

  const useBaseAuth = isExplicitlyTrue || isAuthTypeBasic || (useBaseAuthRaw !== 'false' && hasCredentials && authTypeRaw !== 'bearer');

  let authType: JevAuthType = 'none';
  if (useBaseAuth) {
    authType = 'basic';
  } else if (authTypeRaw === 'bearer' || getVal('LLM_API_KEY') || getVal('JEV_API_KEY')) {
    authType = 'bearer';
  }

  return {
    useBaseAuth,
    authType,
    username: username || undefined,
    password: password || undefined,
    token: token || undefined,
  };
}

/**
 * Creates an overridden fetch function that intercepts HTTP requests
 * and injects Basic Authentication (Base Auth) or custom headers according to config.
 */
export function createJevFetch(
  authConfig?: Partial<JevAuthConfig>,
  baseFetch: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  const resolved: JevAuthConfig = {
    useBaseAuth: false,
    authType: 'none',
    ...authConfig,
  };

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const finalInit: RequestInit = { ...init };

    // Build or normalize headers
    const headersMap: Record<string, string> = {};

    if (init?.headers) {
      if (typeof (init.headers as any).forEach === 'function') {
        (init.headers as any).forEach((value: string, key: string) => {
          headersMap[key.toLowerCase()] = value;
        });
      } else if (Array.isArray(init.headers)) {
        for (const [key, value] of init.headers) {
          headersMap[key.toLowerCase()] = value;
        }
      } else if (typeof init.headers === 'object') {
        for (const [key, value] of Object.entries(init.headers)) {
          if (value !== undefined && value !== null) {
            headersMap[key.toLowerCase()] = String(value);
          }
        }
      }
    }

    // Apply custom default headers if any
    if (resolved.customHeaders) {
      for (const [k, v] of Object.entries(resolved.customHeaders)) {
        headersMap[k.toLowerCase()] = v;
      }
    }

    // Apply Base Auth (Basic Authentication) if enabled
    if (resolved.useBaseAuth || resolved.authType === 'basic') {
      let basicHeaderValue = '';

      if (resolved.token) {
        // If token already looks like Base64 or prefixed
        basicHeaderValue = resolved.token.startsWith('Basic ')
          ? resolved.token
          : `Basic ${resolved.token}`;
      } else if (resolved.username || resolved.password) {
        const u = resolved.username || '';
        const p = resolved.password || '';
        const encoded = Buffer.from(`${u}:${p}`).toString('base64');
        basicHeaderValue = `Basic ${encoded}`;
      }

      if (basicHeaderValue) {
        headersMap['authorization'] = basicHeaderValue;
        headersMap['proxy-authorization'] = basicHeaderValue;
      }
    } else if (resolved.authType === 'bearer' && resolved.token) {
      const bearerValue = resolved.token.startsWith('Bearer ')
        ? resolved.token
        : `Bearer ${resolved.token}`;
      headersMap['authorization'] = bearerValue;
    }

    finalInit.headers = headersMap;

    return baseFetch(input, finalInit);
  };
}

/**
 * Dedicated JEV API Client using overridden fetch
 */
export class JevClient {
  private readonly config: JevAuthConfig;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  public readonly customFetch: typeof globalThis.fetch;

  constructor(options: JevClientOptions = {}) {
    const envConfig = resolveJevAuthConfig();
    this.config = {
      useBaseAuth: options.useBaseAuth ?? envConfig.useBaseAuth,
      authType: options.authType ?? envConfig.authType,
      username: options.username ?? envConfig.username,
      password: options.password ?? envConfig.password,
      token: options.token ?? envConfig.token,
      customHeaders: options.customHeaders,
    };

    this.baseUrl = (options.baseUrl || process.env.JEV_BASE_URL || process.env.LLM_BASE_URL || 'https://api.typesafe.ai').replace(/\/+$/, '');
    this.timeoutMs = options.timeout || 30000;
    this.customFetch = createJevFetch(this.config, options.baseFetch || globalThis.fetch);

    logger.log(
      `[JevClient] Initialized with baseUrl="${this.baseUrl}", useBaseAuth=${this.config.useBaseAuth}, authType="${this.config.authType}"`,
    );
  }

  /**
   * Send a JSON request through the overridden fetch with Base Auth handling
   */
  async request<T = any>(endpoint: string, data?: any, options?: RequestInit): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.customFetch(url, {
        method: options?.method || 'POST',
        headers: {
          'content-type': 'application/json',
          ...(options?.headers as any),
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
        ...options,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`JEV API request failed [HTTP ${response.status}]: ${errorText || response.statusText}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fast System One decision making call
   */
  async decide<T = any>(state: Record<string, any>, questions: Record<string, any>): Promise<T> {
    return this.request<T>('/v1/systemone', {
      model: 'jev-latest',
      state,
      questions,
    });
  }

  getAuthConfig(): JevAuthConfig {
    return { ...this.config };
  }
}

/**
 * NestJS Injectable wrapper for JevClient
 */
@Injectable()
export class JevService {
  private readonly client: JevClient;
  private readonly config: JevAuthConfig;

  constructor(@Optional() @Inject('CONFIG_SERVICE') private readonly configService?: IConfigReader) {
    this.config = resolveJevAuthConfig(this.configService);
    this.client = new JevClient({
      ...this.config,
      baseUrl: this.configService?.get<string>('JEV_BASE_URL') || process.env.JEV_BASE_URL,
    });
  }

  getFetch(): typeof globalThis.fetch {
    return this.client.customFetch;
  }

  getClient(): JevClient {
    return this.client;
  }

  getConfig(): JevAuthConfig {
    return { ...this.config };
  }
}
