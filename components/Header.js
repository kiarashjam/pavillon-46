import Link from 'next/link'

export default function Header() {
  return (
    <header className="page-header">
      <div className="header-left">
        <Link href="/" className="logo-link">
          <span className="logo-icon">P</span>
          <span className="logo-text">PAVILLON</span>
        </Link>
      </div>
      <div className="header-right">
        <span className="opening-date-header">Opening Summer 2027</span>
      </div>
    </header>
  )
}
