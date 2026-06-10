import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'

export function useSocket(erId: string, clientType = 'dashboard') {
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    if (!erId) {
      setSocket(null)
      return
    }

    const s = io('/', {
      auth: { token: sessionStorage.getItem('token') },
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    })
    s.on('connect', () => s.emit('joinER', { erId, clientType }))
    setSocket(s)
    return () => {
      s.disconnect()
    }
  }, [clientType, erId])

  return socket
}
