import twilio from 'twilio'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { countryCode, phoneNumber, code } = req.body

  if (!countryCode || !phoneNumber || !code) {
    return res.status(400).json({ message: 'Phone number and code are required', verified: false })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID

  if (!accountSid || !authToken || !verifySid) {
    return res.status(500).json({ message: 'Server configuration error', verified: false })
  }

  // Format the full phone number
  const fullPhone = `${countryCode}${phoneNumber}`.replace(/\s+/g, '')

  try {
    const client = twilio(accountSid, authToken)

    const verificationCheck = await client.verify.v2
      .services(verifySid)
      .verificationChecks.create({
        to: fullPhone,
        code: String(code), // ensure code is always a string
      })

    if (verificationCheck.status === 'approved') {
      return res.status(200).json({
        message: 'Phone verified successfully',
        verified: true,
      })
    } else {
      // status is 'pending' or 'canceled' — code was wrong
      return res.status(400).json({
        message: 'Invalid verification code',
        verified: false,
        errorType: 'invalid_code',
      })
    }
  } catch (error) {
    console.error('Twilio verify code error:', error.code, error.status, error.message)

    // Twilio error 20404: VerificationCheck not found
    // This happens when the verification expired or too many failed attempts
    if (error.code === 20404 || error.status === 404) {
      return res.status(400).json({
        message: 'Verification expired or not found. Please request a new code.',
        verified: false,
        errorType: 'expired',
      })
    }

    // Twilio error 60202: Max check attempts reached
    if (error.code === 60202) {
      return res.status(400).json({
        message: 'Too many attempts. Please request a new code.',
        verified: false,
        errorType: 'max_attempts',
      })
    }

    // Twilio error 60203: Max send attempts reached  
    if (error.code === 60203) {
      return res.status(429).json({
        message: 'Too many verification requests. Please wait before trying again.',
        verified: false,
        errorType: 'rate_limit',
      })
    }

    return res.status(500).json({
      message: 'Error verifying code',
      detail: error.message,
      verified: false,
      errorType: 'server_error',
    })
  }
}
