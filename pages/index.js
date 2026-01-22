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
        {/* Left Section: Image with fragmented cutouts */}
        <div className="left-section">
          <div className="image-container">
            <div className="image-fragment fragment-1"></div>
            <div className="image-fragment fragment-2"></div>
            <div className="image-fragment fragment-3"></div>
            <div className="image-fragment fragment-4"></div>
            {/* Placeholder for actual image - replace with your image */}
            <div className="image-placeholder"></div>
          </div>
          <div className="legal-text">Legal</div>
        </div>

        {/* Right Section: Content */}
        <div className="right-section">
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
    </>
  )
}
