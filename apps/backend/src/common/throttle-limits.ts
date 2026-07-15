// Per-environment override for a throttle limit, so operations can raise a cap
// (e.g. an on-site event where hundreds of REs enter through the venue Wi-Fi NAT)
// without a redeploy. Returns a resolver evaluated on each request — not at
// decorator evaluation time — because ConfigModule loads .env only after the
// controllers are imported.
export function throttleLimit(envKey: string, fallback: number): () => number {
  return () => {
    const raw = process.env[envKey]?.trim()
    // Strict positive decimal only — reject hex/scientific/float so a typo falls
    // back to the safe default instead of a surprising magnitude.
    if (raw && /^\d+$/.test(raw) && Number(raw) > 0) {
      return Number(raw)
    }
    return fallback
  }
}
