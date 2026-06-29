import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, MapPinned, ShieldAlert, Users, FileBarChart2, Settings, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { PERMISSIONS } from '../auth/roles'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/alerts',    label: 'Alerts', icon: ShieldAlert },
  { to: '/areas',     label: 'Monitoring Areas', icon: MapPinned },
  { to: '/rangers',   label: 'Rangers', icon: Users, permission: PERMISSIONS.MANAGE_RANGERS },
  { to: '/reports',   label: 'Reports', icon: FileBarChart2, permission: PERMISSIONS.VIEW_REPORTS },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { can } = useAuth()

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">🌲</div>
        {!collapsed && (
          <div className="sidebar-brand-text">
            <div className="sidebar-brand-name">AranyAI</div>
            <div className="sidebar-brand-sub">Forest Watch</div>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">{!collapsed && 'Operations'}</div>
        {NAV.filter(n => !n.permission || can(n.permission)).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to} to={to}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            title={collapsed ? label : undefined}
          >
            <Icon />
            {!collapsed && <span className="nav-link-label">{label}</span>}
          </NavLink>
        ))}

        <div className="sidebar-section-label">{!collapsed && 'Account'}</div>
        <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title={collapsed ? 'Settings' : undefined}>
          <Settings />
          {!collapsed && <span className="nav-link-label">Settings</span>}
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <button className="sidebar-collapse-btn" onClick={() => setCollapsed(c => !c)}>
          {collapsed ? <ChevronsRight size={15} /> : <><ChevronsLeft size={15} /> Collapse</>}
        </button>
      </div>
    </aside>
  )
}

export { NAV }
