import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ioMock = vi.fn()

vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => ioMock(...args),
  Socket: class {},
}))

import { useSocket } from './useSocket'

interface FakeSocket {
  on: ReturnType<typeof vi.fn>
  emit: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

function makeSocket(): FakeSocket {
  return { on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }
}

describe('useSocket', () => {
  beforeEach(() => {
    ioMock.mockReset()
    sessionStorage.setItem('token', 'sock-token')
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('returns null and never connects without an erId', () => {
    const { result } = renderHook(() => useSocket(''))
    expect(result.current).toBeNull()
    expect(ioMock).not.toHaveBeenCalled()
  })

  it('connects, joins the ER on connect and disconnects on unmount', () => {
    const socket = makeSocket()
    ioMock.mockReturnValue(socket)

    const { result, unmount } = renderHook(() => useSocket('er-1', 'panel', 'display-token'))

    expect(ioMock).toHaveBeenCalledTimes(1)
    const [, options] = ioMock.mock.calls[0]
    expect(options).toMatchObject({ auth: { token: 'sock-token' } })
    expect(result.current).toBe(socket)

    const connectHandler = socket.on.mock.calls.find(([event]) => event === 'connect')?.[1]
    expect(connectHandler).toBeTypeOf('function')
    connectHandler()
    expect(socket.emit).toHaveBeenCalledWith('joinER', {
      erId: 'er-1',
      clientType: 'panel',
      token: 'display-token',
    })

    unmount()
    expect(socket.disconnect).toHaveBeenCalledTimes(1)
  })

  it('re-emits joinER on every connect (socket.io reconnection)', () => {
    const socket = makeSocket()
    ioMock.mockReturnValue(socket)

    renderHook(() => useSocket('er-1', 'panel', 'display-token'))
    const connectHandler = socket.on.mock.calls.find(([event]) => event === 'connect')?.[1]
    expect(connectHandler).toBeTypeOf('function')

    // socket.io re-dispara 'connect' a cada reconexão; cada uma deve re-entrar na sala.
    connectHandler()
    connectHandler()
    expect(socket.emit).toHaveBeenCalledTimes(2)
    expect(socket.emit).toHaveBeenNthCalledWith(2, 'joinER', {
      erId: 'er-1',
      clientType: 'panel',
      token: 'display-token',
    })
  })

  it('joins with token undefined when no display token is given (dashboard)', () => {
    const socket = makeSocket()
    ioMock.mockReturnValue(socket)

    renderHook(() => useSocket('er-1')) // clientType 'dashboard' default, sem authToken
    const connectHandler = socket.on.mock.calls.find(([event]) => event === 'connect')?.[1]
    connectHandler()

    expect(socket.emit).toHaveBeenCalledWith('joinER', {
      erId: 'er-1',
      clientType: 'dashboard',
      token: undefined,
    })
  })

  it('reconnects with a new socket when the erId changes', () => {
    const first = makeSocket()
    const second = makeSocket()
    ioMock.mockReturnValueOnce(first).mockReturnValueOnce(second)

    const { rerender } = renderHook(({ er }: { er: string }) => useSocket(er), {
      initialProps: { er: 'er-1' },
    })
    expect(ioMock).toHaveBeenCalledTimes(1)

    rerender({ er: 'er-2' })
    expect(first.disconnect).toHaveBeenCalledTimes(1)
    expect(ioMock).toHaveBeenCalledTimes(2)
  })
})
