import twilio from 'twilio'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { countryCode, phoneNumber } = req.body

  if (!countryCode || !phoneNumber) {
    return res.status(400).json({ message: 'Phone number is required' })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID

  if (!accountSid || !authToken || !verifySid) {
    const missing = []
    if (!accountSid) missing.push('TWILIO_ACCOUNT_SID')
    if (!authToken) missing.push('TWILIO_AUTH_TOKEN')
    if (!verifySid) missing.push('TWILIO_VERIFY_SERVICE_SID')
    console.error('Missing Twilio config:', missing.join(', '))
    return res.status(500).json({
      message: 'Server configuration error',
      detail: `Missing: ${missing.join(', ')}. Add them to .env.local.`,
    })
  }

  // Format the full phone number (e.g. "+41" + "791234567" => "+41791234567")
  const fullPhone = `${countryCode}${phoneNumber}`.replace(/\s+/g, '')

  try {
    const client = twilio(accountSid, authToken)

    const verification = await client.verify.v2
      .services(verifySid)
      .verifications.create({
        to: fullPhone,
        channel: 'sms',
      })

    return res.status(200).json({
      message: 'Verification code sent',
      status: verification.status,
    })
  } catch (error) {
    console.error('Twilio send verification error:', error)
    return res.status(500).json({
      message: 'Error sending verification code',
      detail: error.message,
    })
  }
}
