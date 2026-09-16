import { CapacitorHttp } from "@capacitor/core";

import { isNativeAndroid } from "./platformInfo";

export interface HttpResponse<T> {
  data: T;
  status: number;
}

export interface HttpGetOptions {
  /** Timeout de leitura em ms (padrão: 60 000). Seções grandes como VOD podem
   *  precisar de mais tempo em conexões lentas. */
  readTimeout?: number;
  connectTimeout?: number;
}

export interface HttpClient {
  get<T>(url: string, options?: HttpGetOptions): Promise<HttpResponse<T>>;
}

function parseNativeData<T>(data: unknown): T {
  if (typeof data === "string") {
    const cleanData = data.replace(/^\uFEFF/, "").trim();
    try {
      return JSON.parse(cleanData) as T;
    } catch {
      // Mantém texto/HTML para que a camada de serviço consiga usar o status
      // HTTP e mostrar o diagnóstico correto, sem vazar a URL autenticada.
      return cleanData as T;
    }
  }

  return data as T;
}

export const httpClient: HttpClient = {
  async get<T>(url: string, options?: HttpGetOptions): Promise<HttpResponse<T>> {
    const readTimeout = options?.readTimeout ?? 60_000;
    const connectTimeout = options?.connectTimeout ?? 15_000;

    if (isNativeAndroid()) {
      const response = await CapacitorHttp.get({
        url,
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": "PlayTV-Android/1.0"
        },
        connectTimeout,
        readTimeout
      });

      return { data: parseNativeData<T>(response.data), status: response.status };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), readTimeout);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error((await response.text()) || `Request failed with status ${response.status}.`);
      }
      return { data: (await response.json()) as T, status: response.status };
    } finally {
      clearTimeout(timer);
    }
  }
};
