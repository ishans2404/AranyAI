import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

/**
 * Install-to-homescreen control. beforeinstallprompt is Chromium-only and
 * only fires after repeat visits — see react-vite-pwa skill, REFERENCE.md
 * §7/§13. iOS Safari has no programmatic prompt; shows manual steps instead.
 */
export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    const onPrompt = (e) => { e.preventDefault(); setDeferredPrompt(e) }
    const onInstalled = () => { setIsInstalled(true); setDeferredPrompt(null) }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  if (isInstalled) {
    return <p className="t-small t-muted">Installed as an app on this device.</p>
  }

  if (isIOS) {
    return (
      <p className="t-small t-muted">
        On iPhone/iPad: tap the Share icon, then "Add to Home Screen".
      </p>
    )
  }

  if (!deferredPrompt) {
    return <p className="t-small t-faint">Install prompt isn't available yet — visit a couple more times, then check back.</p>
  }

  return (
    <button className="btn btn-secondary" onClick={install}>
      <Download size={14} /> Install AranyAI
    </button>
  )
}
