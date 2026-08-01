import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
export const api = axios.create({ baseURL: import.meta.env.VITE_LMS_API_URL || "https://edugard-aipowerd-1.onrender.com" });

const CATALOG_CACHE_PREFIX = "lms:catalog:";
const CATALOG_CACHE_TTL = 5 * 60 * 1000;
type CachedCatalog = { expiresAt: number; data: unknown; status: number; statusText: string; headers: unknown };
const isCatalogGet = (config: InternalAxiosRequestConfig) => config.method?.toLowerCase() === "get" && config.url === "/api/catalog";
const catalogCacheKey = (config: InternalAxiosRequestConfig) => `${CATALOG_CACHE_PREFIX}${(sessionStorage.getItem("lmsToken") || "none").slice(-12)}:${JSON.stringify(config.params || {})}`;
const clearCatalogCache = () => Object.keys(sessionStorage).filter(key => key.startsWith(CATALOG_CACHE_PREFIX)).forEach(key => sessionStorage.removeItem(key));

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("lmsToken"); if (token) config.headers.Authorization = `Bearer ${token}`;
  if (!isCatalogGet(config)) return config;
  try {
    const cached = JSON.parse(sessionStorage.getItem(catalogCacheKey(config)) || "null") as CachedCatalog | null;
    if (cached && cached.expiresAt > Date.now()) config.adapter = async () => ({ data: cached.data, status: cached.status, statusText: cached.statusText, headers: cached.headers as AxiosResponse["headers"], config, request: {} });
    else sessionStorage.removeItem(catalogCacheKey(config));
  } catch { sessionStorage.removeItem(catalogCacheKey(config)); }
  return config;
});
api.interceptors.response.use(response => {
  if (isCatalogGet(response.config)) try { sessionStorage.setItem(catalogCacheKey(response.config), JSON.stringify({ expiresAt: Date.now() + CATALOG_CACHE_TTL, data: response.data, status: response.status, statusText: response.statusText, headers: response.headers } satisfies CachedCatalog)); } catch { /* Cache is optional. */ }
  else if (response.config.url?.startsWith("/api/catalog") && response.config.method?.toLowerCase() !== "get") clearCatalogCache();
  return response;
});
export const idempotency = () => ({ headers: { "Idempotency-Key": crypto.randomUUID() } });
