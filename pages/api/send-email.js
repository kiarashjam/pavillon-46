import sgMail from '@sendgrid/mail';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { fullName, phoneNumber, emailAddress, postalCode, language = 'fr' } = req.body;

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

  // Translations for emails
  const emailTranslations = {
    fr: {
      admin: {
        subject: `Nouvelle inscription sur la liste d'attente: ${fullName}`,
        title: 'Nouvelle inscription sur la liste d\'attente',
        intro: 'Un nouvel utilisateur a rejoint la liste d\'attente:',
        nameLabel: 'Nom:',
        emailLabel: 'E-mail:',
        phoneLabel: 'Téléphone:',
        postalCodeLabel: 'Code postal:',
        languageNote: 'Langue choisie: Français',
        footer: 'Envoyé depuis le système du site Web Pavillon 46',
      },
      user: {
        subject: 'Bienvenue sur la liste d\'attente de Pavillon 46',
        title: 'Bienvenue à Pavillon 46',
        greeting: `Cher/Chère ${fullName},`,
        body1: 'Merci de votre intérêt pour <strong>Pavillon 46</strong>. Nous sommes ravis de vous avoir sur notre liste d\'attente.',
        body2: 'Notre équipe examine votre candidature et vous contactera sous peu avec plus d\'informations sur notre adhésion exclusive.',
        body3: 'En attendant, si vous avez des questions, veuillez consulter nos mises à jour.',
        closing: 'Cordialement,',
        team: 'L\'équipe Pavillon 46',
        footer: `&copy; ${new Date().getFullYear()} Pavillon 46. Tous droits réservés.`,
        location: 'La Croix-sur-Lutry, Suisse',
      },
    },
    en: {
      admin: {
        subject: `New Waitlist Signup: ${fullName}`,
        title: 'New Waitlist Signup',
        intro: 'A new user has joined the waitlist:',
        nameLabel: 'Name:',
        emailLabel: 'Email:',
        phoneLabel: 'Phone:',
        postalCodeLabel: 'Postal Code:',
        languageNote: 'Language chosen: English',
        footer: 'Sent from Pavillon 46 Website System',
      },
      user: {
        subject: 'Welcome to the Pavillon 46 Waitlist',
        title: 'Welcome to Pavillon 46',
        greeting: `Dear ${fullName},`,
        body1: 'Thank you for your interest in <strong>Pavillon 46</strong>. We are thrilled to have you on our waitlist.',
        body2: 'Our team is reviewing your application, and we will contact you shortly with more information about our exclusive membership.',
        body3: 'In the meantime, if you have any questions, please verify our updates.',
        closing: 'Warm regards,',
        team: 'The Pavillon 46 Team',
        footer: `&copy; ${new Date().getFullYear()} Pavillon 46. All rights reserved.`,
        location: 'La Croix-sur-Lutry, Switzerland',
      },
    },
  };

  const t = emailTranslations[language] || emailTranslations.fr;

  const adminEmailHtml = `
    <div style="${emailStyles}">
      <div style="${headerStyle}">
        <h2 style="margin:0; color:#000;">${t.admin.title}</h2>
      </div>
      <div style="padding: 20px; background-color: #fff;">
        <p style="font-size: 16px;"><strong>${t.admin.intro}</strong></p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; width: 30%;"><strong>${t.admin.nameLabel}</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${fullName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>${t.admin.emailLabel}</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${emailAddress}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>${t.admin.phoneLabel}</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${phoneNumber}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>${t.admin.postalCodeLabel}</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${postalCode}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-top: 2px solid #ddd; border-bottom: 1px solid #eee; background-color: #f8f9fa;" colspan="2">
              <strong>${t.admin.languageNote}</strong>
            </td>
          </tr>
        </table>
      </div>
      <div style="${footerStyle}">
        <p>${t.admin.footer}</p>
      </div>
    </div>
  `;

  const userEmailHtml = `
    <div style="${emailStyles}">
      <div style="${headerStyle}">
        <h1 style="margin:0; font-size: 24px; color:#000;">${t.user.title}</h1>
      </div>
      <div style="padding: 20px; background-color: #fff;">
        <p>${t.user.greeting}</p>
        <p>${t.user.body1}</p>
        <p>${t.user.body2}</p>
        <p>${t.user.body3}</p>
        <br>
        <p>${t.user.closing}</p>
        <p><strong>${t.user.team}</strong></p>
      </div>
      <div style="${footerStyle}">
        <p>${t.user.footer}</p>
        <p>${t.user.location}</p>
      </div>
    </div>
  `;

  const msgToAdmin = {
    to: adminEmail,
    from: fromEmail,
    subject: t.admin.subject,
    text: `${t.admin.intro}\n${t.admin.nameLabel} ${fullName}\n${t.admin.emailLabel} ${emailAddress}\n${t.admin.phoneLabel} ${phoneNumber}\n${t.admin.postalCodeLabel} ${postalCode}\n\n${t.admin.languageNote}`,
    html: adminEmailHtml,
  };

  const msgToUser = {
    to: emailAddress,
    from: fromEmail,
    subject: t.user.subject,
    text: `${t.user.greeting}\n\n${t.user.body1.replace(/<strong>|<\/strong>/g, '')}\n\n${t.user.body2}\n\n${t.user.body3}\n\n${t.user.closing}\n${t.user.team}`,
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
