import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './ui/presentation/twoPointFiveD.css'

const el = document.getElementById('root')
if (!el) throw new Error('Missing #root element')

// Note: no StrictMode here. The game engine mutates stateful objects; StrictMode
// would intentionally double-invoke certain lifecycles in dev, which can cause
// duplicate game mutations.
createRoot(el).render(
  <React.Fragment>
    <App />
  </React.Fragment>,
)
