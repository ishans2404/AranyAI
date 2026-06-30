import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, ChevronDown } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { roleLabel } from '../auth/roles'
import { initials } from '../lib/format'

export default function Topbar({ crumbs = [] }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <header className="topbar">
      <div className="topbar-crumb">
        {crumbs.map((c, i) => (
          <span key={i} className={i === crumbs.length - 1 ? 'current' : ''}>
            {c}
            {i < crumbs.length - 1 && <span className="sep"> / </span>}
          </span>
        ))}
      </div>

      <div className="row gap-4">
        {/* <div className="row gap-2 t-small t-muted topbar-status">
          <span className="dot" style={{ width: 6, height: 6, background: 'var(--link-blue)' }} />
          System Operational · Google Earth Engine · Dynamic World V1 (10m)
        </div> */}

        <div className="user-menu" ref={ref}>
          <button className="user-menu-trigger" onClick={() => setOpen(o => !o)}>
            <div className="avatar">{initials(user?.name)}</div>
            <div style={{ textAlign: 'left' }}>
              <div className="user-menu-name">{user?.name}</div>
              <div className="user-menu-role">{roleLabel(user?.role)}</div>
            </div>
            <ChevronDown size={14} />
          </button>
          {open && (
            <div className="user-menu-panel">
              <button className="user-menu-item" onClick={() => navigate('/settings')}>Settings</button>
              <button className="user-menu-item" onClick={() => { logout(); navigate('/login') }}>
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
