import sgMail from '@sendgrid/mail'
import { translations } from '../../lib/translations'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { fullName, phoneNumber, emailAddress, postalCode, language = 'fr' } = req.body

  if (!process.env.SENDGRID_API_KEY) {
    console.error('SENDGRID_API_KEY is not defined')
    return res.status(500).json({
      message: 'Server configuration error',
      detail: 'SENDGRID_API_KEY is missing. Add it to .env.local (see .env.local.example).',
    })
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY)

  const adminEmail = process.env.ADMIN_EMAIL
  const fromEmail = process.env.FROM_EMAIL

  if (!adminEmail || !fromEmail) {
    const missing = [].concat(
      !adminEmail ? 'ADMIN_EMAIL' : [],
      !fromEmail ? 'FROM_EMAIL' : []
    )
    console.error('ADMIN_EMAIL or FROM_EMAIL is not defined:', missing.join(', '))
    return res.status(500).json({
      message: 'Server configuration error',
      detail: `Missing: ${missing.join(', ')}. Add them to .env.local (see .env.local.example).`,
    })
  }

  // --- Email Templates ---

  // Modern email styles with transparency
  const emailWrapperStyle = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.6;
    color: #333333;
    background-color: #fafafa;
    margin: 0;
    padding: 0;
    width: 100%;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  `;

  const emailContainerStyle = `
    max-width: 600px;
    margin: 0 auto;
    background-color: rgba(255, 255, 255, 0.95);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  `;

  const headerStyle = `
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.7) 0%, rgba(118, 75, 162, 0.7) 100%);
    padding: 40px 30px;
    text-align: center;
    color: #ffffff;
  `;

  const contentStyle = `
    padding: 40px 30px;
    background-color: rgba(255, 255, 255, 0.95);
  `;

  const footerStyle = `
    margin-top: 30px;
    padding: 30px;
    background-color: rgba(248, 249, 250, 0.6);
    border-top: 1px solid rgba(234, 234, 234, 0.5);
    font-size: 13px;
    color: #666666;
    text-align: center;
    line-height: 1.8;
  `;

  const buttonStyle = `
    display: inline-block;
    padding: 14px 32px;
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.7) 0%, rgba(118, 75, 162, 0.7) 100%);
    color: #ffffff;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 600;
    font-size: 16px;
    margin: 20px 0;
    text-align: center;
  `;

  const highlightBoxStyle = `
    background-color: rgba(248, 249, 255, 0.5);
    border-left: 4px solid rgba(102, 126, 234, 0.4);
    padding: 20px;
    margin: 25px 0;
    border-radius: 4px;
  `;

  // Get email translations
  const lang = language === 'en' ? 'en' : 'fr'
  const t = translations[lang].email
  const currentYear = new Date().getFullYear()

  const adminEmailHtml = `
    <div style="${emailWrapperStyle}">
      <div style="${emailContainerStyle}">
        <div style="${headerStyle}">
          <h2 style="margin:0; color:rgba(255, 255, 255, 0.95); font-size: 24px;">${t.admin.title}</h2>
        </div>
        <div style="${contentStyle}">
          <p style="font-size: 16px; margin-bottom: 20px;"><strong>${t.admin.intro}</strong></p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid rgba(238, 238, 238, 0.6); width: 30%; background-color: rgba(248, 249, 250, 0.5);"><strong>${t.admin.nameLabel}</strong></td>
              <td style="padding: 12px; border-bottom: 1px solid rgba(238, 238, 238, 0.6);">${fullName}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid rgba(238, 238, 238, 0.6); background-color: rgba(248, 249, 250, 0.5);"><strong>${t.admin.emailLabel}</strong></td>
              <td style="padding: 12px; border-bottom: 1px solid rgba(238, 238, 238, 0.6);">${emailAddress}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid rgba(238, 238, 238, 0.6); background-color: rgba(248, 249, 250, 0.5);"><strong>${t.admin.phoneLabel}</strong></td>
              <td style="padding: 12px; border-bottom: 1px solid rgba(238, 238, 238, 0.6);">${phoneNumber}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid rgba(238, 238, 238, 0.6); background-color: rgba(248, 249, 250, 0.5);"><strong>${t.admin.postalCodeLabel}</strong></td>
              <td style="padding: 12px; border-bottom: 1px solid rgba(238, 238, 238, 0.6);">${postalCode}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-top: 2px solid rgba(221, 221, 221, 0.5); background-color: rgba(240, 244, 255, 0.4);" colspan="2">
                <strong>${t.admin.languageNote}</strong>
              </td>
            </tr>
          </table>
        </div>
        <div style="${footerStyle}">
          <p>${t.admin.footer}</p>
        </div>
      </div>
    </div>
  `

  const userEmailHtml = `
    <!DOCTYPE html>
    <html lang="${lang}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${t.user.subject}</title>
    </head>
    <body style="${emailWrapperStyle}">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fafafa; padding: 20px 0;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="${emailContainerStyle}">
              <!-- Header -->
              <tr>
                <td style="${headerStyle}">
                  <h1 style="margin: 0; font-size: 32px; font-weight: 700; color: rgba(255, 255, 255, 0.95); letter-spacing: -0.5px;">
                    ${t.user.title}
                  </h1>
                  <p style="margin: 10px 0 0 0; font-size: 16px; color: rgba(255, 255, 255, 0.85);">
                    ${lang === 'fr' ? 'La vie en couleurs' : 'Life in Full Color'}
                  </p>
                </td>
              </tr>
              
              <!-- Main Content -->
              <tr>
                <td style="${contentStyle}">
                  <p style="margin: 0 0 20px 0; font-size: 18px; color: #333333; font-weight: 500;">
                    ${typeof t.user.greeting === 'function' ? t.user.greeting(fullName) : t.user.greeting}
                  </p>
                  
                  <p style="margin: 0 0 20px 0; font-size: 16px; color: #555555; line-height: 1.8;">
                    ${t.user.body1}
                  </p>
                  
                  <div style="${highlightBoxStyle}">
                    <p style="margin: 0; font-size: 15px; color: #444444; line-height: 1.8;">
                      ${t.user.body2}
                    </p>
                  </div>
                  
                  <p style="margin: 20px 0; font-size: 16px; color: #555555; line-height: 1.8;">
                    ${t.user.body3}
                  </p>
                  
                  <!-- Divider -->
                  <div style="height: 1px; background: linear-gradient(to right, transparent, rgba(224, 224, 224, 0.5), transparent); margin: 35px 0;"></div>
                  
                  <!-- Closing -->
                  <p style="margin: 0 0 8px 0; font-size: 16px; color: #333333;">
                    ${t.user.closing}
                  </p>
                  <p style="margin: 0; font-size: 18px; color: rgba(102, 126, 234, 0.8); font-weight: 600;">
                    ${t.user.team}
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="${footerStyle}">
                  <p style="margin: 0 0 8px 0;">
                    ${typeof t.user.footer === 'function' ? t.user.footer(currentYear) : t.user.footer}
                  </p>
                  <p style="margin: 0; color: #999999; font-size: 12px;">
                    ${t.user.location}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  const msgToAdmin = {
    to: adminEmail,
    from: fromEmail,
    subject: typeof t.admin.subject === 'function' ? t.admin.subject(fullName) : t.admin.subject,
    text: `${t.admin.intro}\n${t.admin.nameLabel} ${fullName}\n${t.admin.emailLabel} ${emailAddress}\n${t.admin.phoneLabel} ${phoneNumber}\n${t.admin.postalCodeLabel} ${postalCode}\n\n${t.admin.languageNote}`,
    html: adminEmailHtml,
  }

  const msgToUser = {
    to: emailAddress,
    from: fromEmail,
    subject: t.user.subject,
    text: `${typeof t.user.greeting === 'function' ? t.user.greeting(fullName) : t.user.greeting}\n\n${t.user.body1.replace(/<strong>|<\/strong>/g, '')}\n\n${t.user.body2}\n\n${t.user.body3}\n\n${t.user.closing}\n${t.user.team}`,
    html: userEmailHtml,
  }

  try {
    await Promise.all([
      sgMail.send(msgToAdmin),
      sgMail.send(msgToUser),
    ])
    return res.status(200).json({ message: 'Emails sent successfully' })
  } catch (error) {
    console.error('SendGrid Error:', error)
    if (error.response) {
      console.error(error.response.body)
    }
    return res.status(500).json({ message: 'Error sending emails' })
  }
}
