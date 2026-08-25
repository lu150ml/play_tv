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
    return JSON.parse(data) as T;
  }

  return data as T;
}

export const httpClient: HttpClient = {
  async get<T>(url: string): Promise<HttpResponse<T>> {
    if (isNativeAndroid()) {
      const response = await CapacitorHttp.get({
        url,
        connectTimeout: 15_000,
        readTimeout: 30_000
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
