import sgMail from '@sendgrid/mail';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { fullName, phoneNumber, emailAddress, postalCode } = req.body;

  if (!process.env.SENDGRID_API_KEY) {
    console.error('SENDGRID_API_KEY is not defined');
    return res.status(500).json({ message: 'Server configuration error' });
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const adminEmail = process.env.ADMIN_EMAIL;
  const fromEmail = process.env.FROM_EMAIL;

  if (!adminEmail || !fromEmail) {
    console.error('ADMIN_EMAIL or FROM_EMAIL is not defined');
    return res.status(500).json({ message: 'Server configuration error' });
  }

  // --- Email Templates ---

  const emailStyles = `
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    line-height: 1.6;
    color: #333;
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
  `;

  const headerStyle = `
    background-color: #f8f9fa;
    padding: 20px;
    text-align: center;
    border-bottom: 2px solid #eaeaea;
    margin-bottom: 20px;
  `;

  const footerStyle = `
    margin-top: 30px;
    padding-top: 20px;
    border-top: 1px solid #eaeaea;
    font-size: 12px;
    color: #888;
    text-align: center;
  `;

  const adminEmailHtml = `
    <div style="${emailStyles}">
      <div style="${headerStyle}">
        <h2 style="margin:0; color:#000;">New Waitlist Signup</h2>
      </div>
      <div style="padding: 20px; background-color: #fff;">
        <p style="font-size: 16px;"><strong>A new user has joined the waitlist:</strong></p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; width: 30%;"><strong>Name:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${fullName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Email:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${emailAddress}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Phone:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${phoneNumber}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Postal Code:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${postalCode}</td>
          </tr>
        </table>
      </div>
      <div style="${footerStyle}">
        <p>Sent from Pavillon 46 Website System</p>
      </div>
    </div>
  `;

  const userEmailHtml = `
    <div style="${emailStyles}">
      <div style="${headerStyle}">
        <h1 style="margin:0; font-size: 24px; color:#000;">Welcome to Pavillon 46</h1>
      </div>
      <div style="padding: 20px; background-color: #fff;">
        <p>Dear ${fullName},</p>
        <p>Thank you for your interest in <strong>Pavillon 46</strong>. We are thrilled to have you on our waitlist.</p>
        <p>Our team is reviewing your application, and we will contact you shortly with more information about our exclusive membership.</p>
        <p>In the meantime, if you have any questions, please verify our updates.</p>
        <br>
        <p>Warm regards,</p>
        <p><strong>The Pavillon 46 Team</strong></p>
      </div>
      <div style="${footerStyle}">
        <p>&copy; ${new Date().getFullYear()} Pavillon 46. All rights reserved.</p>
        <p>La Croix-sur-Lutry, Switzerland</p>
      </div>
    </div>
  `;

  const msgToAdmin = {
    to: adminEmail,
    from: fromEmail,
    subject: `New Waitlist Signup: ${fullName}`,
    text: `New signup:\nName: ${fullName}\nEmail: ${emailAddress}\nPhone: ${phoneNumber}\nPostal Code: ${postalCode}`,
    html: adminEmailHtml,
  };

  const msgToUser = {
    to: emailAddress,
    from: fromEmail,
    subject: 'Welcome to the Pavillon 46 Waitlist',
    text: `Dear ${fullName},\n\nThank you for joining the waitlist for Pavillon 46. We have received your information and will be in touch soon.\n\nBest regards,\nPavillon 46 Team`,
    html: userEmailHtml,
  };

  try {
    await Promise.all([
      sgMail.send(msgToAdmin),
      sgMail.send(msgToUser),
    ]);
    return res.status(200).json({ message: 'Emails sent successfully' });
  } catch (error) {
    console.error('SendGrid Error:', error);
    if (error.response) {
      console.error(error.response.body);
    }
    return res.status(500).json({ message: 'Error sending emails' });
  }
}
