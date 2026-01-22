import Link from 'next/link'
import Image from 'next/image'

export default function Header() {
  return (
    <header className="page-header">
      <div className="header-left">
        <Link href="/" className="logo-link">
          <Image 
            src="/images/svg.png" 
            alt="PAVILLON 46" 
            width={120} 
            height={40}
            className="header-logo-image"
            priority
          />
        </Link>
      </div>
      <div className="header-right">
        <span className="opening-date-header">Opening Summer 2027</span>
      </div>
    </header>
  )
}
