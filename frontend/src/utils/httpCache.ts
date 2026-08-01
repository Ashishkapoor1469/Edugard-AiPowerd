import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

const TTL_MS = 60 * 1000;
const PROFILE_TTL_MS = 5 * 60 * 1000;
const PREFIX = "eduguard:http-cache:";
const SAFE_GETS = ["/api/admin/colleges", "/api/admin/degrees", "/api/college-admin/syllabus", "/api/library/students/", "/api/attendance/student/"];
let installed = false;

type CachedResponse = {
  timestamp: number;
  data: unknown;
  status: number;
  statusText: string;
  headers: unknown;
};

const stableStringify = (value: unknown): string => {
  if (!value || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    .join(",")}}`;
};

const cacheKey = (config: InternalAxiosRequestConfig) =>
  `${PREFIX}${(localStorage.getItem("token") || "none").slice(-12)}:${config.url || ""}:${stableStringify(config.params)}`;

const ttl = (config: InternalAxiosRequestConfig) =>
  config.url?.startsWith("/api/library/students/") || config.url?.startsWith("/api/attendance/student/") ? PROFILE_TTL_MS : TTL_MS;

const isCacheable = (config: InternalAxiosRequestConfig) =>
  config.method?.toLowerCase() === "get" &&
  config.responseType !== "blob" &&
  SAFE_GETS.some((path) => (config.url || "").startsWith(path));

export const installHttpCache = () => {
  if (installed) return;
  installed = true;

  axios.interceptors.request.use((config) => {
    if (!isCacheable(config)) return config;

    const cached = sessionStorage.getItem(cacheKey(config));
    if (!cached) return config;

    try {
      const parsed: CachedResponse = JSON.parse(cached);
      if (Date.now() - parsed.timestamp > ttl(config)) {
        sessionStorage.removeItem(cacheKey(config));
        return config;
      }

      config.adapter = async () => ({
        data: parsed.data,
        status: parsed.status,
        statusText: parsed.statusText,
        headers: parsed.headers as AxiosResponse["headers"],
        config,
        request: {},
      });
    } catch {
      sessionStorage.removeItem(cacheKey(config));
    }

    return config;
  });

  axios.interceptors.response.use((response) => {
    if (!isCacheable(response.config)) return response;

    try {
      sessionStorage.setItem(
        cacheKey(response.config),
        JSON.stringify({
          timestamp: Date.now(),
          data: response.data,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        } satisfies CachedResponse)
      );
    } catch {
      // ponytail: cache is optional; if storage is full, keep the network response.
    }
    return response;
  });
};
