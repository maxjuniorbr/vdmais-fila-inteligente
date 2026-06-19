// Mock de teste para `jwks-rsa`.
//
// O jwks-rsa v4 depende do `jose` (v6), que é ESM puro. O Jest roda em CommonJS
// e não consegue carregar esse ESM, então qualquer suíte que importe a strategy
// de integração (→ jwks-rsa → jose) falha ao carregar. Em runtime não há esse
// problema: o Node 22.12+ suporta `require()` de ESM (que é justamente o engine
// exigido pelo jwks-rsa v4).
//
// Os testes exercitam o NOSSO wiring (RS256, issuer/audience, fail-closed,
// extração de escopos) — não o miolo do jwks-rsa. Então devolvemos um provider
// de chave dummy: o suficiente para a strategy montar o `secretOrKeyProvider`.
export function passportJwtSecret() {
  return (
    _req: unknown,
    _rawJwt: unknown,
    done: (err: Error | null, key?: string) => void,
  ) => done(null, 'test-signing-key')
}
