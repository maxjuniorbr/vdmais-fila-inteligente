export const SCOPE_TICKETS_START = 'tickets:start'

export const SCOPE_TICKETS_FINISH = 'tickets:finish'

export const INTEGRATION_DEV_KID = 'integration-dev'

export const INTEGRATION_DEV_TOKEN_TTL_SECONDS = 3600

// Vale para o campo do corpo E para o header Idempotency-Key: o header não passa
// pelo ValidationPipe, então o controller trunca nesse limite antes de mesclar.
export const IDEMPOTENCY_KEY_MAX_LENGTH = 200
