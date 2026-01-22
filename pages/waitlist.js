import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import Header from '../components/Header'
import Footer from '../components/Footer'

export default function Waitlist() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    fullName: '',
    phoneNumber: '',
    emailAddress: '',
    postalCode: '',
  })

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // In a real application, you would send the data to a server here
    // For now, we'll just redirect to the thank you page
    router.push('/thank-you')
  }

  return (
    <>
      <Head>
        <title>Join the Waitlist - Pavillon 46</title>
        <meta name="description" content="Join the waitlist for Pavillon 46" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="waitlist-page">
        <Header />

        {/* Background Image Container */}
        <div className="background-container">
          <div className="background-image"></div>
        </div>

        {/* Waitlist Form Overlay */}
        <div className="form-overlay">
          <div className="form-container">
            <Link href="/" className="go-back-link">← Go Back</Link>
            
            <h1 className="form-heading">Something exclusive is coming</h1>
            
            <form className="waitlist-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  placeholder="Your Full Name"
                  className="form-input"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                />
              </div>
              
              <div className="form-group">
                <input
                  type="tel"
                  id="phoneNumber"
                  name="phoneNumber"
                  placeholder="Your Phone Number"
                  className="form-input"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  required
                />
              </div>
              
              <div className="form-group">
                <input
                  type="email"
                  id="emailAddress"
                  name="emailAddress"
                  placeholder="Your Email Address"
                  className="form-input"
                  value={formData.emailAddress}
                  onChange={handleChange}
                  required
                />
              </div>
              
              <div className="form-group">
                <input
                  type="text"
                  id="postalCode"
                  name="postalCode"
                  placeholder="Your Postal Code"
                  className="form-input"
                  value={formData.postalCode}
                  onChange={handleChange}
                  required
                />
              </div>
              
              <button type="submit" className="submit-button">Join the Waitlist</button>
            </form>
            
            <div className="form-links">
              <a href="#" className="form-link">I have a code</a>
              <a href="#" className="form-link">Already a member?</a>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </>
  )
}
