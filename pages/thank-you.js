import Head from 'next/head'
import Image from 'next/image'
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
              <Image 
                src="/images/Frame%201000004712.svg" 
                alt="Success" 
                width={80} 
                height={80}
                className="checkmark-svg"
              />
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
