import { X } from 'lucide-react'
import { Link } from 'react-router-dom'
import AlertCard from './AlertCard'

export default function AlertDrawer({ alert, areaName, onClose, onUpdate, rangers, viewerName }) {
  if (!alert) return null
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,19,.35)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="scroll-thin"
        style={{ width: 380, maxWidth: '92vw', height: '100%', background: 'var(--bg)', boxShadow: 'var(--shadow-3)', padding: 'var(--sp-5)' }}
      >
        <div className="row-between" style={{ marginBottom: 16 }}>
          <div>
            <h3 className="t-section-title">Alert review</h3>
            {areaName && <p className="t-small t-muted" style={{ marginTop: 2 }}>{areaName}</p>}
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <AlertCard alert={alert} onUpdate={onUpdate} rangers={rangers} viewerName={viewerName} defaultExpanded />

        {alert.aoi_id && (
          <Link to={`/areas/${alert.aoi_id}/monitor`} className="btn btn-secondary btn-full" style={{ marginTop: 14 }}>
            View on map
          </Link>
        )}
      </div>
    </div>
  )
}
