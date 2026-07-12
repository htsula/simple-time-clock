import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import './index.css'
import Home from './pages/Home.tsx'
import Clock from './pages/Clock.tsx'
import Admin from './pages/Admin.tsx'
import Employees from './pages/admin/Employees.tsx'
import Shifts from './pages/admin/Shifts.tsx'
import Reports from './pages/admin/Reports.tsx'

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/clock', element: <Clock /> },
  { path: '/clock/:employee', element: <Clock /> },
  {
    path: '/admin',
    element: <Admin />,
    children: [
      { index: true, element: <Navigate to="/admin/employees" replace /> },
      { path: 'employees', element: <Employees /> },
      { path: 'shifts', element: <Shifts /> },
      { path: 'reports', element: <Reports /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
