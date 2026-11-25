import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/roboto/wght.css'
import '@fontsource/pt-serif/cyrillic-400.css'
import '@fontsource/pt-serif/latin-400.css'
import '@fontsource/pt-serif/cyrillic-700.css'
import '@fontsource/pt-serif/latin-700.css'
import '@fontsource/pt-serif/latin-400-italic.css'
import './styles.css'
import { App } from './App'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
