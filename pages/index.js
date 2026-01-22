import Link from 'next/link'
import Head from 'next/head'

export default function Home() {
  return (
    <>
      <Head>
        <title>Pavillon 46</title>
        <meta name="description" content="Welcome to Pavillon 46 - Life in Full Color" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="container">
        {/* Full-page: image 6 background */}
        <div className="page-bg" aria-hidden="true" />
        {/* Full-page: blur + dark overlay (makes background not clear) */}
        <div className="page-overlay" aria-hidden="true" />

        {/* Left Section: obscured background only */}
        <div className="left-section">
          <div className="legal-wrap">
            <div className="legal-line" />
            <div className="legal-text">Legal</div>
          </div>
        </div>

        {/* Right Section: image 4 on top + content */}
        <div className="right-section">
          <div className="right-image" aria-hidden="true" />
          <div className="right-content">
            <div className="opening-date">Opening Summer 2027</div>
            <div className="welcome-text">Welcome to</div>
            <div className="logo-container">
              <div className="logo-main">
                <span className="logo-pavillon">PAVILLON</span>
                <span className="logo-number">46</span>
              </div>
              <div className="logo-subtitle">LA CROIX-SUR-LUTRY</div>
            </div>
            <div className="slogan">
              <span className="slogan-part1">Life in</span>
              <span className="slogan-part2">Full Color</span>
            </div>
            <Link href="/waitlist" className="join-button">
              <span className="button-text">Join the Waitlist</span>
            </Link>
            <p className="footer-text">Access i by invitation, with limited membership</p>
          </div>
        </div>
      </div>
    </>
  )
}
