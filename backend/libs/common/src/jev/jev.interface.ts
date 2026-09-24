/**
 * JEV Base Auth & Fetch Override Configuration Interfaces
 */

export type JevAuthType = 'basic' | 'bearer' | 'none';

export interface JevAuthConfig {
  /**
   * Whether Base Auth (Basic Authentication) is enabled.
   * Typically evaluated from JEV_USE_BASE_AUTH or JEV_USE_BASIC_AUTH environment variable.
   */
  useBaseAuth: boolean;

  /**
   * The authentication scheme to use: 'basic', 'bearer', or 'none'.
   */
  authType: JevAuthType;

  /**
   * Username for HTTP Basic Authentication.
   */
  username?: string;

  /**
   * Password for HTTP Basic Authentication.
   */
  password?: string;

  /**
   * Raw or pre-encoded token for Basic or Bearer Authentication.
   */
  token?: string;

  /**
   * Optional custom default headers to attach to every outgoing request.
   */
  customHeaders?: Record<string, string>;
}

export interface JevClientOptions extends Partial<JevAuthConfig> {
  /**
   * Base URL for JEV API or LLM Gateway endpoint.
   */
  baseUrl?: string;

  /**
   * API Key for Bearer token fallback.
   */
  apiKey?: string;

  /**
   * Request timeout in milliseconds (default: 30000ms).
   */
  timeout?: number;

  /**
   * Custom base fetch function (defaults to globalThis.fetch).
   */
  baseFetch?: typeof globalThis.fetch;
}
