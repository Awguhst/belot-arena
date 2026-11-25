import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Modal } from '../Settings'
import { t } from '../i18n'
import type { Lang } from '../store'
import { tableText } from './names'
import './resetGame.css'

export function ResetGameButton({
  lang,
  sessionId,
  restart,
}: {
  lang: Lang
  sessionId: string
  restart: () => void
}) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const open = confirming === sessionId
  useEffect(() => {
    if (open) return () => trigger.current?.focus({ preventScroll: true })
  }, [open])
  const label = tableText(lang, 'resetGame')
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="mast-reset"
        onClick={() => setConfirming(sessionId)}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
      >
        <RefreshCw size={15} aria-hidden="true" />
        <span>{label}</span>
      </button>
      {open && (
        <Modal label={tableText(lang, 'resetTitle')} close={() => setConfirming(null)}>
          <p>{tableText(lang, 'resetDetail')}</p>
          <div className="modal-actions">
            <button
              type="button"
              className="btn secondary"
              autoFocus
              onClick={() => setConfirming(null)}
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setConfirming(null)
                restart()
              }}
            >
              {label}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
