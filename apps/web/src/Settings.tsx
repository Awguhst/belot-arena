import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { CONTRACTS, type Contract } from '@belot/game-engine'
import type { Difficulty } from '@belot/bots'
import { useClub, type Lang } from './store'
import { t } from './i18n'
import { AnimationControl, AssistanceControls, AudioControls } from './table/TablePreferences'
import { toolsWord } from './table/toolWords'
import './table/tools.css'

export function Modal({
  label,
  close,
  children,
}: {
  label: string
  close: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-label={label}
      className="modal"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="modal-inner">
        <div className="section-head">
          <h2>{label}</h2>
          <button className="icon-button" aria-label={label + ' ×'} onClick={close}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
function SelectField<V extends string | number>({
  label,
  values,
  value,
  onChange,
  render,
}: {
  label: string
  values: readonly V[]
  value: V
  onChange: (value: V) => void
  render: (v: V) => string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(values.find((entry) => String(entry) === e.target.value)!)}
      >
        {values.map((v) => (
          <option key={v} value={v}>
            {render(v)}
          </option>
        ))}
      </select>
    </label>
  )
}
const levels = ['beginner', 'intermediate', 'advanced'] as const
const targets = [51, 101, 151] as const
export function Setup({
  lang,
  practice,
  close,
  onStart,
}: {
  lang: Lang
  practice: boolean
  close: () => void
  onStart: () => void
}) {
  const { prefs, active, start } = useClub()
  const [difficulty, changeDifficulty] = useState<Difficulty>(prefs.difficulty)
  const [target, changeTarget] = useState<number>(prefs.target)
  const [contract, changeContract] = useState<Contract | 'auction'>(practice ? 'hearts' : 'auction')
  return (
    <Modal label={t(lang, practice ? 'trainingMode' : 'options')} close={close}>
      <div className="form-fields">
        <SelectField
          label={t(lang, 'contract')}
          values={['auction', ...CONTRACTS] as const}
          value={contract}
          onChange={changeContract}
          render={(v) => t(lang, v)}
        />
        <SelectField
          label={t(lang, 'difficulty')}
          values={levels}
          value={difficulty}
          onChange={changeDifficulty}
          render={(v) => t(lang, v)}
        />
        <SelectField
          label={t(lang, 'playTo')}
          values={targets}
          value={target}
          onChange={changeTarget}
          render={(v) => v + ' ' + t(lang, 'pts')}
        />
      </div>
      {active && active.view('south').phase !== 'MATCH_COMPLETE' && (
        <p className="notice">{t(lang, 'replace')}</p>
      )}
      <div className="modal-actions">
        <button className="btn secondary" onClick={close}>
          {t(lang, 'cancel')}
        </button>
        <button
          className="btn"
          onClick={() => {
            start(
              { target, ...(contract === 'auction' ? {} : { practiceContract: contract }) },
              difficulty,
            )
            onStart()
          }}
        >
          {t(lang, 'start')}
        </button>
      </div>
    </Modal>
  )
}
export function Settings({ lang }: { lang: Lang }) {
  const { prefs, setPref } = useClub()
  return (
    <>
      <div className="page-intro">
        <h1 className="page-title">{t(lang, 'settings')}</h1>
        <p>{t(lang, 'preferencesHelp')}</p>
      </div>
      <div className="settings-grid">
        <section className="panel padded">
          <h2>{t(lang, 'general')}</h2>
          <SelectField
            label={t(lang, 'language')}
            values={['bg', 'en'] as const}
            value={lang}
            onChange={(v) => setPref('lang', v)}
            render={(v) => (v === 'bg' ? 'Български' : 'English')}
          />
          <SelectField
            label={t(lang, 'speed')}
            values={['slow', 'normal', 'fast'] as const}
            value={prefs.speed}
            onChange={(v) => setPref('speed', v)}
            render={(v) => t(lang, v)}
          />
          <label className="switch-row">
            <span>{t(lang, 'motion')}</span>
            <input
              role="switch"
              type="checkbox"
              checked={prefs.motion}
              onChange={(e) => setPref('motion', e.target.checked)}
            />
          </label>
          <AnimationControl lang={lang} />
          <details className="tt-section">
            <summary>{toolsWord(lang, 'audio')}</summary>
            <AudioControls lang={lang} />
          </details>
          <h3 className="subhead">
            <SlidersHorizontal size={17} />
            {t(lang, 'playOptions')}
          </h3>
          <SelectField
            label={t(lang, 'difficulty')}
            values={levels}
            value={prefs.difficulty}
            onChange={(v) => setPref('difficulty', v)}
            render={(v) => t(lang, v)}
          />
          <SelectField
            label={t(lang, 'playTo')}
            values={targets}
            value={prefs.target}
            onChange={(v) => setPref('target', v)}
            render={(v) => v + ' ' + t(lang, 'pts')}
          />
        </section>
        <section className="panel padded">
          <h2>{t(lang, 'learning')}</h2>
          <AssistanceControls lang={lang} />
        </section>
      </div>
      <p className="muted">{t(lang, 'saved')}</p>
    </>
  )
}
