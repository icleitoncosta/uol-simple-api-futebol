import axios, { AxiosRequestConfig } from 'axios';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

/** GET com user-agent de navegador, timeout e uma nova tentativa em erro de rede ou 5xx. */
export async function httpGet<T = any>(url: string, config: AxiosRequestConfig = {}): Promise<T> {
  const opts: AxiosRequestConfig = {
    timeout: 25_000,
    ...config,
    headers: { 'user-agent': UA, accept: 'application/json, text/html;q=0.9, */*;q=0.8', ...config.headers },
  };
  try {
    return (await axios.get<T>(url, opts)).data;
  } catch (error: any) {
    const status = error?.response?.status;
    if (status && status < 500) throw error;
    await new Promise((r) => setTimeout(r, 1500));
    return (await axios.get<T>(url, opts)).data;
  }
}
