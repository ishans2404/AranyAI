import { useState } from 'react'
import { Check, X, AlertCircle } from 'lucide-react'
import { OFFICER_REASONS } from '../../lib/dw'

export default function OutcomePicker({ alert, onUpdate, viewerName }) {
  const [reasonOpen, setReasonOpen] = useState(false)
  const [reason, setReason] = useState('cloud_shadow')

  const submit = (officer_outcome, officer_reason = null) => {
    onUpdate(alert.id, { officer_outcome, officer_reason, verified_by: viewerName || 'Administrator' })
    setReasonOpen(false)
  }

  return (
    <div>
      <div className="row gap-2">
        <button className={`btn btn-xs btn-primary ${alert.officer_outcome === 'confirmed' ? '' : 'btn-secondary'}`} onClick={() => submit('confirmed')}>
          <Check size={12} /> Confirm
        </button>
        <button className="btn btn-xs btn-signal-outline" onClick={() => setReasonOpen(o => !o)}>
          <X size={12} /> False alarm
        </button>
        <button className={`btn btn-xs btn-secondary`} onClick={() => submit('needs_follow_up')}>
          <AlertCircle size={12} /> Follow up
        </button>
      </div>

      {reasonOpen && (
        <div className="row gap-2" style={{ marginTop: 8 }}>
          <select className="form-control" style={{ fontSize: 12, padding: '6px 10px' }} value={reason} onChange={e => setReason(e.target.value)}>
            {Object.entries(OFFICER_REASONS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <button className="btn btn-xs btn-signal" onClick={() => submit('false_alarm', reason)}>Confirm</button>
        </div>
      )}

      {alert.officer_outcome && (
        <p className="t-small t-faint" style={{ marginTop: 8 }}>
          Recorded {alert.officer_outcome === 'false_alarm' ? `false alarm (${OFFICER_REASONS[alert.officer_reason] || '—'})` : alert.officer_outcome.replace(/_/g, ' ')}
          {alert.verified_by ? ` by ${alert.verified_by}` : ''}
        </p>
      )}
    </div>
  )
}
