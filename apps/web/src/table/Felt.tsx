import { memo } from 'react'

/** Original engraved club mark and gold inlay. Both are purely decorative. */
export const ClubCrest = memo(function ClubCrest() {
  return (
    <svg viewBox="0 0 156 84" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.2">
        <path d="M60 68Q34 63 19 35M96 68Q122 63 137 35" />
        {[false, true].map((mirror) => (
          <g key={String(mirror)} transform={mirror ? 'translate(156) scale(-1 1)' : undefined}>
            <path
              d="M52 65Q36 67 30 59Q42 57 52 65ZM41 59Q26 57 22 49Q34 48 41 59ZM31 50Q18 45 16 37Q26 38 31 50ZM53 65Q49 56 51 49Q58 55 53 65ZM42 60Q35 50 38 43Q46 50 42 60ZM32 51Q27 41 30 33Q36 41 32 51Z"
              fill="currentColor"
              strokeWidth=".3"
            />
          </g>
        ))}
        <path d="m69 75 9 3 9-3M75 9l3-4 3 4-3 4Z" />
      </g>
      <path
        fill="currentColor"
        d="M78 16c-5 8-20 17-20 28 0 10 12 14 18 6-1 6-3 10-7 13h18c-5-4-7-8-7-13 7 8 18 4 18-6 0-11-14-19-20-28Z"
      />
      <path d="m78 28-6 12 6 7 6-7Z" fill="var(--felt-ink,#194a37)" />
    </svg>
  )
})
export const FeltInlay = memo(function FeltInlay() {
  return (
    <div className="felt-inlay" aria-hidden="true">
      <div className="felt-racetrack" />
      <div className="felt-racetrack inner" />
      {['nw', 'ne', 'sw', 'se'].map((c) => (
        <svg
          key={c}
          className={'etched-corner ' + c}
          viewBox="0 0 97 97"
          fill="none"
          stroke="currentColor"
        >
          <path d="M1 86V24L24 1h62M8 69V28L28 8h41M16 46V31l15-15h15" />
          <path d="m13 13 2.5-7 2.5 7-2.5 7Z" fill="currentColor" stroke="none" />
          <circle cx="89" cy="1" r="1.4" />
          <circle cx="1" cy="89" r="1.4" />
        </svg>
      ))}
    </div>
  )
})
