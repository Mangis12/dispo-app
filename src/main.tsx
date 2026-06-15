import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AuthGate from './components/AuthGate.tsx'
import { LangProvider } from './lib/i18n.tsx'
import { RoleProvider } from './lib/roles.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <AuthGate>
        <RoleProvider>
          <App />
        </RoleProvider>
      </AuthGate>
    </LangProvider>
  </StrictMode>,
)
