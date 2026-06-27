import { NavLink, Outlet, useParams } from 'react-router-dom'
import { useAreaData } from '../hooks/useAreaData'
import { SkeletonLines } from '../components/ui/Primitives'

export default function AreaWorkspaceLayout() {
  const { aoiId } = useParams()
  const areaData = useAreaData(aoiId)

  if (areaData.loading && !areaData.aoi) {
    return <div style={{ padding: 32, maxWidth: 360 }}><SkeletonLines count={4} /></div>
  }

  return (
    <>
      <div className="workspace-tabs">
        <NavLink to="monitor" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>Map &amp; Detection</NavLink>
        <NavLink to="alerts" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
          Verification Queue
          {areaData.alerts.filter(a => a.status === 'open').length > 0 && (
            <span className="tab-count">{areaData.alerts.filter(a => a.status === 'open').length}</span>
          )}
        </NavLink>
      </div>
      <Outlet context={areaData} />
    </>
  )
}
