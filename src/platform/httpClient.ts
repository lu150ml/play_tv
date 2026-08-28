import { CapacitorHttp } from "@capacitor/core";

import { isNativeAndroid } from "./platformInfo";

export interface HttpResponse<T> {
  data: T;
  status: number;
}

export interface HttpClient {
  get<T>(url: string): Promise<HttpResponse<T>>;
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
  async get<T>(url: string): Promise<HttpResponse<T>> {
    if (isNativeAndroid()) {
      // Catálogos VOD/séries podem ser bem maiores que a TV ao vivo; 60s evita
      // marcar filmes/séries como erro enquanto o live já terminou.
      const response = await CapacitorHttp.get({
        url,
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": "PlayTV-Android/1.0"
        },
        connectTimeout: 15_000,
        readTimeout: 60_000
      });

      return { data: parseNativeData<T>(response.data), status: response.status };
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error((await response.text()) || `Request failed with status ${response.status}.`);
    }

    return { data: (await response.json()) as T, status: response.status };
  }
};
