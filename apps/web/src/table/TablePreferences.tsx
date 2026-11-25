import {
  useClub,
  expertRestricted,
  type AssistanceMode,
  type AnimationSpeed,
  type Lang,
  type Preferences,
} from '../store'
import { t, type Key } from '../i18n'
import { toolsWord as w } from './toolWords'
import { unlockTableAudio } from './sound'
import { useTableRoom, useTablePrefSetter } from './roomContext'

const choices = ['standard', 'learning', 'expert'] as const
const speeds: AnimationSpeed[] = ['cinematic', 'normal', 'fast', 'instant']
const features = [
  ['highlights', 'highlights'],
  ['reasons', 'reasons'],
  ['points', 'points'],
  ['rankings', 'rankings'],
  ['tracker', 'tracker'],
  ['winning', 'winning'],
  ['bidAdvice', 'context'],
  ['autoDeclare', 'autoDeclare'],
  ['undo', 'undoSetting'],
] as const satisfies readonly (readonly [keyof Preferences, Key])[]

export function AssistanceControls({ lang }: { lang: Lang }) {
  const prefs = useClub((state) => state.prefs)
  const setPref = useTablePrefSetter()
  const room = useTableRoom()
  return (
    <>
      <label className="field">
        <span>{w(lang, 'assistanceMode')}</span>
        <select
          value={prefs.assistanceMode}
          onChange={(e) => setPref('assistanceMode', e.target.value as AssistanceMode)}
        >
          {choices.map((mode) => (
            <option key={mode} value={mode}>
              {w(lang, mode)}
            </option>
          ))}
        </select>
      </label>
      {prefs.assistanceMode === 'expert' && <p className="tt-muted">{w(lang, 'expertHelp')}</p>}
      {features.map(([key, label]) => {
        if (
          room &&
          (key === 'undo' ||
            (key === 'bidAdvice' || key === 'autoDeclare' ? !room.hints : !room.education))
        )
          return null
        const disabled =
          prefs.assistanceMode === 'expert' && expertRestricted.some((feature) => feature === key)
        return (
          <label key={key} className="switch-row">
            <span>{t(lang, label)}</span>
            <input
              type="checkbox"
              role="switch"
              checked={prefs[key]}
              disabled={disabled}
              onChange={(e) => setPref(key, e.target.checked)}
            />
          </label>
        )
      })}
      {room?.hints !== false && (
        <label className="switch-row">
          <span>{w(lang, 'autoCoach')}</span>
          <input
            type="checkbox"
            role="switch"
            checked={prefs.assistanceMode === 'learning' && prefs.autoCoach}
            disabled={prefs.assistanceMode !== 'learning'}
            onChange={(e) => setPref('autoCoach', e.target.checked)}
          />
        </label>
      )}
    </>
  )
}
export function AnimationControl({ lang }: { lang: Lang }) {
  const prefs = useClub((state) => state.prefs)
  const setPref = useTablePrefSetter()
  return (
    <label className="field">
      <span>{w(lang, 'animationSpeed')}</span>
      <select
        value={prefs.animationSpeed}
        disabled={!prefs.motion}
        onChange={(e) => setPref('animationSpeed', e.target.value as AnimationSpeed)}
      >
        {speeds.map((speed) => (
          <option value={speed} key={speed}>
            {w(lang, speed)}
          </option>
        ))}
      </select>
    </label>
  )
}
export function AudioControls({ lang }: { lang: Lang }) {
  const prefs = useClub((state) => state.prefs)
  const setPref = useTablePrefSetter()
  return (
    <>
      <label className="switch-row">
        <span>{w(lang, 'muted')}</span>
        <input
          type="checkbox"
          role="switch"
          checked={prefs.muted}
          onChange={(e) => {
            const muted = e.target.checked
            setPref('muted', muted)
            if (!muted) unlockTableAudio()
          }}
        />
      </label>
      {(
        [
          ['masterVolume', 'volume'],
          ['effectsVolume', 'effects'],
        ] as const
      ).map(([key, label]) => (
        <label className="tt-range" key={key}>
          <span>{w(lang, label)}</span>
          <output>{prefs[key]}%</output>
          <input
            type="range"
            min="0"
            max="100"
            value={prefs[key]}
            aria-label={w(lang, label)}
            onChange={(e) => setPref(key, Number(e.target.value))}
          />
        </label>
      ))}
      <label className="switch-row">
        <span>{w(lang, 'ambient')}</span>
        <input
          type="checkbox"
          role="switch"
          checked={prefs.ambient}
          onChange={(e) => {
            setPref('ambient', e.target.checked)
            if (e.target.checked && !prefs.muted) unlockTableAudio()
          }}
        />
      </label>
    </>
  )
}
export function LivePreferences({ lang }: { lang: Lang }) {
  const prefs = useClub((state) => state.prefs)
  const setPref = useTablePrefSetter()
  const room = useTableRoom()
  return (
    <div className="tt-settings">
      <label className="field">
        <span>{t(lang, 'language')}</span>
        <select value={lang} onChange={(e) => setPref('lang', e.target.value as Lang)}>
          <option value="bg">Български</option>
          <option value="en">English</option>
        </select>
      </label>
      {!room && (
        <label className="field">
          <span>{t(lang, 'speed')}</span>
          <select
            value={prefs.speed}
            onChange={(e) => setPref('speed', e.target.value as Preferences['speed'])}
          >
            {(['slow', 'normal', 'fast'] as const).map((speed) => (
              <option key={speed} value={speed}>
                {t(lang, speed)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="switch-row">
        <span>{t(lang, 'motion')}</span>
        <input
          type="checkbox"
          role="switch"
          checked={prefs.motion}
          onChange={(e) => setPref('motion', e.target.checked)}
        />
      </label>
      <AnimationControl lang={lang} />
      {(!room || room.hints || room.education) && (
        <details open className="tt-section">
          <summary>{w(lang, 'options')}</summary>
          <AssistanceControls lang={lang} />
        </details>
      )}
      <details className="tt-section">
        <summary>{w(lang, 'audio')}</summary>
        <AudioControls lang={lang} />
      </details>
    </div>
  )
}
