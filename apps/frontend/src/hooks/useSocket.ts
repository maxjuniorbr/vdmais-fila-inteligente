import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'

export function useSocket(erId: string, clientType = 'dashboard') {
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    if (!erId) {
      setSocket(null)
      return
    }

    // In production the socket connects directly to the backend (WebSocket
    // cannot be proxied through Vercel). In dev it stays relative so the Vite
    // proxy forwards /socket.io to localhost:3000.
    const socketUrl = import.meta.env.VITE_API_URL || '/'
    const s = io(socketUrl, {
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
