import axios from "axios";
export const api = axios.create({ baseURL: import.meta.env.VITE_LMS_API_URL || "http://localhost:5100" });
api.interceptors.request.use((config) => { const token = sessionStorage.getItem("lmsToken"); if (token) config.headers.Authorization = `Bearer ${token}`; return config; });
export const idempotency = () => ({ headers: { "Idempotency-Key": crypto.randomUUID() } });
