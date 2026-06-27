import Sparkline from '../ui/Sparkline'

export default function ExplainabilityBundle({ bundle }) {
  if (!bundle) return null
  return (
    <div className="col gap-3" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      {bundle.caption && <p className="t-small" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{bundle.caption}</p>}
      {bundle.timeseries?.length > 1 && <Sparkline data={bundle.timeseries} />}
      {(bundle.before_tile_url || bundle.after_tile_url) && (
        <div className="row gap-2">
          {['before', 'after'].map(stage => {
            const url = stage === 'before' ? bundle.before_tile_url : bundle.after_tile_url
            return (
              <div key={stage} style={{ flex: 1, minWidth: 0 }}>
                {url
                  ? <img alt={stage} src={url.replace('{z}/{x}/{y}', '13/0/0')}
                         style={{ width: '100%', height: 64, objectFit: 'cover', borderRadius: 'var(--r-xs)', border: '1px solid var(--border)', background: 'var(--soft-bone)' }} />
                  : <div style={{ width: '100%', height: 64, borderRadius: 'var(--r-xs)', background: 'var(--soft-bone)' }} />}
                <div className="t-eyebrow" style={{ textAlign: 'center', marginTop: 4, fontSize: 9.5 }}>{stage}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
