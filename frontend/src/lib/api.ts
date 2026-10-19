/** fetch with a JSON body. Callers check the status themselves. */
export function api(url: string, method = "GET", body?: unknown): Promise<Response> {
  if (body === undefined) return fetch(url, { method });
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
