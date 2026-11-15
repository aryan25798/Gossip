import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import 'leaflet/dist/leaflet.css'
import { AuthProvider } from './contexts/AuthContext'
import { CallProvider } from './contexts/CallContext'
import { PresenceProvider } from './contexts/PresenceContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ChatProvider } from './contexts/ChatContext'
import { VoiceCallProvider } from './contexts/VoiceCallContext'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <CallProvider>
          <VoiceCallProvider>
            <PresenceProvider>
              <ChatProvider>
                <App />
              </ChatProvider>
            </PresenceProvider>
          </VoiceCallProvider>
        </CallProvider>
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>,
)
