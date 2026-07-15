import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { SOCKET_URL } from '../api/config'

export function useSocket(erId: string, clientType = 'dashboard', authToken?: string) {
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    if (!erId) {
      setSocket(null)
      return
    }

    const s = io(SOCKET_URL, {
      auth: { token: sessionStorage.getItem('token') },
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    })
    s.on('connect', () => s.emit('joinER', { erId, clientType, token: authToken }))
    setSocket(s)
    return () => {
      s.disconnect()
    }
  }, [authToken, clientType, erId])

  return socket
}
