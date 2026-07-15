// FRONTEND_URL aceita uma lista separada por vírgula: os ambientes corporativos
// têm domínios distintos por estágio (hml/prod) e todos precisam passar no CORS.
export function parseAllowedOrigins(value: string | undefined): string[] {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  return origins.length > 0 ? origins : ['http://localhost:5173']
}
