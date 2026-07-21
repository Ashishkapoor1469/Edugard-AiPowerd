import axios from "axios";

export const listLoadError = (error: unknown, fallback: string) =>
  axios.isAxiosError(error) && error.response?.status === 429
    ? "Too many requests — please wait a moment and try again."
    : fallback;
