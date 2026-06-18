import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './styles/theme.css'
import { QueueEntryPage } from './pages/QueueEntryPage'
import { TicketConfirmationPage } from './pages/TicketConfirmationPage'
import { CheckinAttendantPage } from './pages/CheckinAttendantPage'
import { OperationPage } from './pages/OperationPage'
import { ManagerPage } from './pages/ManagerPage'
import { PanelPage } from './pages/PanelPage'
import { AdminPage } from './pages/AdminPage'
import { HomePage } from './pages/HomePage'
import { PlaygroundPage } from './pages/PlaygroundPage'
import { SimuladorPage } from './pages/SimuladorPage'
import { ToastProvider } from './components/Toast'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/fila/:erId" element={<QueueEntryPage />} />
          <Route path="/fila/:erId/senha" element={<TicketConfirmationPage />} />
          <Route path="/checkin" element={<CheckinAttendantPage />} />
          <Route path="/operacao" element={<OperationPage />} />
          <Route path="/gestao" element={<ManagerPage />} />
          <Route path="/painel/:erId" element={<PanelPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/playground" element={<PlaygroundPage />} />
          <Route path="/simulador" element={<SimuladorPage />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
