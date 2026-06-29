import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { NAV } from './Sidebar'

/**
 * 4-5 items fits the skill's "bottom tab bar is best for 3-5 top-level
 * destinations" guidance exactly (Admin sees 5, Ranger sees 4 — Rangers
 * page is permission-gated out for a Ranger). Settings stays in the
 * Topbar's avatar menu rather than competing for a 6th slot here.
 */
export default function BottomNav() {
  const { can } = useAuth()
  const items = NAV.filter(n => !n.permission || can(n.permission))

  return (
    <nav className="bottom-nav">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}>
          <Icon size={20} />
          <span>{label === 'Monitoring Areas' ? 'Areas' : label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
