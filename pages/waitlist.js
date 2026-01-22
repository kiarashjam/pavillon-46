import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import Header from '../components/Header'
import Footer from '../components/Footer'

export default function Waitlist() {
  const router = useRouter()
  const [status, setStatus] = useState('idle')
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
    setStatus('loading')

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        setStatus('success')
        router.push('/thank-you')
      } else {
        setStatus('error')
        alert('Something went wrong. Please try again.')
      }
    } catch (error) {
      console.error(error)
      setStatus('error')
      alert('Error connecting to the server.')
    }
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
              
              <button type="submit" className="submit-button" disabled={status === 'loading'}>
                {status === 'loading' ? 'Joining...' : 'Join the Waitlist'}
              </button>
            </form>
            
            <div className="form-links">
              <a href="#" className="form-link" onClick={(e) => e.preventDefault()}>I have a code</a>
              <a href="#" className="form-link" onClick={(e) => e.preventDefault()}>Already a member?</a>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </>
  )
}
