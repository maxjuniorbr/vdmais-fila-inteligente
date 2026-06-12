import { PrismaService } from '../../prisma/prisma.service'
import { PanelTokenService } from '../panel-token.service'

const prisma = {
  eR: { update: jest.fn(), findUnique: jest.fn() },
}

function build() {
  return new PanelTokenService(prisma as unknown as PrismaService)
}

describe('PanelTokenService', () => {
  beforeEach(() => jest.resetAllMocks())

  it('rotate stores only the hash and returns an opaque token', async () => {
    prisma.eR.update.mockResolvedValue({})
    const service = build()

    const token = await service.rotate('er-1')

    expect(token).toMatch(/^[A-Za-z0-9_-]{20,}$/)
    const data = prisma.eR.update.mock.calls[0][0].data
    expect(data.panelTokenHash).toHaveLength(64)
    expect(data.panelTokenHash).not.toContain(token)
  })

  it('rotate produces a different token each time', async () => {
    prisma.eR.update.mockResolvedValue({})
    const service = build()
    const first = await service.rotate('er-1')
    const second = await service.rotate('er-1')
    expect(first).not.toBe(second)
  })

  it('revoke clears the stored hash', async () => {
    prisma.eR.update.mockResolvedValue({})
    await build().revoke('er-1')
    expect(prisma.eR.update).toHaveBeenCalledWith({
      where: { id: 'er-1' },
      data: { panelTokenHash: null },
    })
  })

  it('verify accepts the matching token', async () => {
    const service = build()
    prisma.eR.update.mockResolvedValue({})
    const token = await service.rotate('er-1')
    const storedHash = prisma.eR.update.mock.calls[0][0].data.panelTokenHash
    prisma.eR.findUnique.mockResolvedValue({ panelTokenHash: storedHash })

    await expect(service.verify('er-1', token)).resolves.toBe(true)
  })

  it('verify rejects a wrong token', async () => {
    const service = build()
    prisma.eR.update.mockResolvedValue({})
    await service.rotate('er-1')
    const storedHash = prisma.eR.update.mock.calls[0][0].data.panelTokenHash
    prisma.eR.findUnique.mockResolvedValue({ panelTokenHash: storedHash })

    await expect(service.verify('er-1', 'not-the-token')).resolves.toBe(false)
  })

  it('verify rejects when the ER has no token configured', async () => {
    prisma.eR.findUnique.mockResolvedValue({ panelTokenHash: null })
    await expect(build().verify('er-1', 'anything')).resolves.toBe(false)
  })

  it('verify rejects when the ER does not exist', async () => {
    prisma.eR.findUnique.mockResolvedValue(null)
    await expect(build().verify('missing', 'anything')).resolves.toBe(false)
  })

  it('verify rejects an empty erId or token without querying', async () => {
    const service = build()
    await expect(service.verify('', 'token')).resolves.toBe(false)
    await expect(service.verify('er-1', undefined)).resolves.toBe(false)
    expect(prisma.eR.findUnique).not.toHaveBeenCalled()
  })
})
