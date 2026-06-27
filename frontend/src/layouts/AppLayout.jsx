import { useState } from 'react'
import { Outlet, useLocation, useParams } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { useAppData } from '../hooks/useAppData'

const SECTION_LABEL = {
  dashboard: 'Dashboard',
  alerts:    'Alerts',
  areas:     'Monitoring Areas',
  rangers:   'Rangers',
  reports:   'Reports',
  settings:  'Settings',
}

function useBreadcrumb() {
  const { pathname } = useLocation()
  const { aoiId } = useParams()
  const { aois } = useAppData()
  const segments = pathname.split('/').filter(Boolean)
  const crumbs = ['AranyAI']

  if (segments[0]) crumbs.push(SECTION_LABEL[segments[0]] || segments[0])
  if (segments[0] === 'areas' && aoiId) {
    const aoi = aois.find(a => a.id === aoiId)
    crumbs.push(aoi ? aoi.name : 'Area')
    const tab = segments[2]
    if (tab === 'monitor') crumbs.push('Map & Detection')
    if (tab === 'alerts')  crumbs.push('Verification Queue')
  }
  return crumbs
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const crumbs = useBreadcrumb()

  return (
    <div className="app-shell">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="main-col">
        <Topbar crumbs={crumbs} />
        <div className="workspace">
          <Outlet />
        </div>
        <footer className="app-footer">
          <span>© 2026 Chhattisgarh Forest Department · AranyAI Forest Monitoring Platform</span>
          <span>Powered by Google Earth Engine · Dynamic World V1 · Sentinel-2</span>
        </footer>
      </div>
    </div>
  )
}
