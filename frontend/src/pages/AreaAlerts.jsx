import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useAppData } from '../hooks/useAppData'
import { ROLES } from '../auth/roles'
import { PrecisionPill } from '../components/ui/PrecisionPill'
import Queue from '../components/alerts/Queue'

export default function AreaAlerts() {
  const { aoi, alerts, sites, precision, updateAlert } = useOutletContext()
  const { user } = useAuth()
  const { rangers } = useAppData()

  return (
    <div className="workspace-scroll">
      <div className="row-between" style={{ marginBottom: 16 }}>
        <div>
          <h2 className="t-section-title">{aoi?.name}</h2>
          <p className="t-small t-muted">{aoi?.division}{aoi?.range_name ? ` · ${aoi.range_name}` : ''}</p>
        </div>
        <PrecisionPill precision={precision} />
      </div>

      <Queue
        alerts={alerts}
        sites={sites}
        rangers={user.role === ROLES.ADMIN ? rangers : []}
        onUpdate={updateAlert}
        viewerName={user.name}
      />
    </div>
  )
}
