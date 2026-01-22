import Head from 'next/head'
import Header from '../components/Header'
import Footer from '../components/Footer'

export default function ThankYou() {
  return (
    <>
      <Head>
        <title>Thank You - Pavillon 46</title>
        <meta name="description" content="Thank you for your inquiry" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="waitlist-page">
        <Header />

        {/* Background Image Container */}
        <div className="background-container">
          <div className="background-image"></div>
        </div>

        {/* Thank You Overlay */}
        <div className="form-overlay">
          <div className="thank-you-container">
            <h1 className="thank-you-heading">Thank you for your inquiry</h1>
            
            <div className="checkmark-icon">
              <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="30" cy="30" r="28" stroke="#2B5541" strokeWidth="2"/>
                <path d="M18 30 L26 38 L42 22" stroke="#2B5541" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
            
            <div className="confirmation-messages">
              <p className="confirmation-text">You&apos;ll receive a confirmation email.</p>
              <p className="confirmation-text">We will contact you shortly.</p>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </>
  )
}
