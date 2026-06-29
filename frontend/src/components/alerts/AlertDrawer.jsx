import { X } from 'lucide-react'
import { Link } from 'react-router-dom'
import AlertCard from './AlertCard'

export default function AlertDrawer({ alert, areaName, onClose, onUpdate, rangers, viewerName }) {
  if (!alert) return null
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="drawer-panel scroll-thin">
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
