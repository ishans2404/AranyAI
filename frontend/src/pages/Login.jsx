import { useEffect, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { LogIn, Loader2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user) navigate(location.state?.from?.pathname || '/dashboard', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      navigate(location.state?.from?.pathname || '/dashboard', { replace: true })
    } catch {
      setError('Invalid email or password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <Link to="/" className="auth-mark" style={{ textDecoration: 'none' }}>🌲</Link>
        <h1 className="t-display auth-title">AranyAI</h1>
        <p className="auth-subtitle">Forest change detection &amp; monitoring · Chhattisgarh Forest Department</p>

        <form onSubmit={submit} className="col gap-3">
          <div>
            <label className="form-label">Email</label>
            <input
              className="form-control" type="email" required autoFocus autoComplete="username"
              value={email} onChange={e => setEmail(e.target.value)} placeholder="you@aranyai.com"
            />
          </div>
          <div>
            <label className="form-label">Password</label>
            <input
              className="form-control" type="password" required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
            />
          </div>
          {error && <p className="t-small" style={{ color: 'var(--signal-strong)' }}>{error}</p>}
          <button className="btn btn-primary btn-full" disabled={submitting} type="submit">
            {submitting ? <><Loader2 size={14} className="spin" /> Signing in…</> : <><LogIn size={14} /> Sign in</>}
          </button>
        </form>

        <p className="t-small t-faint" style={{ textAlign: 'center', marginTop: 18 }}>
          Access is provisioned by the department administrator.
        </p>
      </div>
    </div>
  )
}