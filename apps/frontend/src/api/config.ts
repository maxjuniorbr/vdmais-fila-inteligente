// Uma única env (VITE_API_URL) resolve a base do REST e do WebSocket: sem ela,
// tudo é mesma origem e passa pelo proxy ('/api' no Vite em dev / rewrite na
// hospedagem); com ela, REST e socket falam direto com o backend — o modelo dos
// ambientes corporativos (frontend e backend em hosts separados).
function withoutTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value.codePointAt(end - 1) === 47) end -= 1
  return value.slice(0, end)
}

export function resolveApiBase(apiUrl: string | undefined): string {
  const direct = apiUrl ? withoutTrailingSlashes(apiUrl.trim()) : undefined
  return direct || '/api'
}

export function resolveSocketUrl(apiUrl: string | undefined): string {
  return apiUrl?.trim() || '/'
}

export const API_BASE = resolveApiBase(import.meta.env.VITE_API_URL)
export const SOCKET_URL = resolveSocketUrl(import.meta.env.VITE_API_URL)
