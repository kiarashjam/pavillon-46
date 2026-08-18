import type { InputHTMLAttributes, ReactNode } from 'react'
import { passwordStrength } from './adminHelpers'

export function AdminField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="adash-auth-field">
      <span className="adash-auth-label">{label}</span>
      {children}
      {hint && <span className="adash-auth-hint">{hint}</span>}
    </label>
  )
}

export function AdminTextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`adash-auth-input${props.className ? ` ${props.className}` : ''}`} />
}

export function AdminPasswordInput({
  show,
  onToggle,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { show: boolean; onToggle: () => void }) {
  return (
    <div className="adash-auth-pw">
      <input
        {...props}
        type={show ? 'text' : 'password'}
        className={`adash-auth-input${props.className ? ` ${props.className}` : ''}`}
      />
      <button
        type="button"
        className="adash-auth-pw-toggle"
        aria-pressed={show}
        aria-label={show ? 'Hide password' : 'Show password'}
        onClick={onToggle}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

export function AdminPasswordMeter({ password }: { password: string }) {
  const { score, label } = passwordStrength(password)
  if (!password) return null
  return (
    <div className="adash-auth-meter" aria-live="polite">
      <span className="adash-auth-meter-track" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <i key={n} className={`adash-auth-meter-seg${score >= n ? ` is-${score}` : ''}`} />
        ))}
      </span>
      <span className="adash-auth-meter-label">{label}</span>
    </div>
  )
}

export function AdminEmpty({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="adash-empty-rich">
      <span className="adash-empty-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <rect x="8" y="12" width="32" height="24" rx="6" stroke="currentColor" strokeWidth="1.6" />
          <path d="M16 24h16M16 29h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <p className="adash-empty-title">{title}</p>
      {hint && <p className="adash-empty-hint">{hint}</p>}
      {action}
    </div>
  )
}

export function AdminSkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="adash-skel" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="adash-skel-row" />
      ))}
    </div>
  )
}

export function AdminSplash({ message = 'Opening the console…' }: { message?: string }) {
  return (
    <div className="adash">
      <div className="adash-ambient" aria-hidden="true" />
      <div className="adash-grain" aria-hidden="true" />
      <div className="adash-splash" role="status" aria-live="polite">
        <span className="adash-splash-ring" aria-hidden="true" />
        <p>{message}</p>
      </div>
    </div>
  )
}
