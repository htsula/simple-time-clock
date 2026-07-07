import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import Home from './pages/Home.tsx'
import Clock from './pages/Clock.tsx'
import Admin from './pages/Admin.tsx'

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/clock', element: <Clock /> },
  { path: '/admin', element: <Admin /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
