import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ShieldCheck, UserRound } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { ROLES } from '../auth/roles'
import { api } from '../lib/api'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [rangers, setRangers] = useState([])

  useEffect(() => { api.listRangers().then(setRangers).catch(() => {}) }, [])

  const enter = (role, name) => {
    login(role, name)
    navigate(location.state?.from?.pathname || '/dashboard', { replace: true })
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-mark">🌲</div>
        <h1 className="t-display auth-title">AranyAI</h1>
        <p className="auth-subtitle">Forest change detection &amp; monitoring · Chhattisgarh Forest Department</p>

        <button className="role-option" onClick={() => enter(ROLES.ADMIN, 'Administrator')}>
          <span className="role-option-icon"><ShieldCheck size={17} /></span>
          <span>
            <div className="role-option-title">Continue as Administrator</div>
            <div className="role-option-sub">Full access — all areas, rangers, reports</div>
          </span>
        </button>

        {rangers.map(r => (
          <button key={r.name} className="role-option" onClick={() => enter(ROLES.RANGER, r.name)}>
            <span className="role-option-icon"><UserRound size={17} /></span>
            <span>
              <div className="role-option-title">Continue as {r.name}</div>
              <div className="role-option-sub">{r.aoi_ids.length} assigned area{r.aoi_ids.length === 1 ? '' : 's'}</div>
            </span>
          </button>
        ))}

        <p className="t-small t-faint" style={{ textAlign: 'center', marginTop: 18 }}>
          Identity selection only — no password yet. See Settings for details.
        </p>
      </div>
    </div>
  )
}
