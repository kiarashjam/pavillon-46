/**
 * Centralized translations for Pavillon 46
 * All text content in French and English
 */

export const translations = {
  fr: {
    // Common
    common: {
      legal: 'Mentions légales',
      privacy: 'Politique de confidentialité',
      goBack: '← Retour',
      haveCode: 'J\'ai un code',
      alreadyMember: 'Déjà membre ?',
    },
    
    // Homepage
    home: {
      title: 'Pavillon 46',
      description: 'Bienvenue à Pavillon 46 - La vie en couleurs',
      openingDate: 'Ouverture été 2027',
      welcomeText: 'Bienvenue à',
      sloganPart1: 'La vie en',
      sloganPart2: 'couleurs',
      joinButton: 'Rejoindre la liste d\'attente',
      footerText: 'Accès sur invitation, avec un nombre limité de membres',
    },
    
    // Waitlist
    waitlist: {
      title: 'Rejoindre la liste d\'attente - Pavillon 46',
      description: 'Rejoignez la liste d\'attente pour Pavillon 46',
      heading: 'Quelque chose d\'exclusif arrive',
      fullNamePlaceholder: 'Votre nom complet',
      phonePlaceholder: 'Votre numéro de téléphone',
      emailPlaceholder: 'Votre adresse e-mail',
      postalCodePlaceholder: 'Votre code postal',
      submitButton: 'Rejoindre la liste d\'attente',
      submitting: 'Inscription en cours...',
      errorMessage: 'Une erreur s\'est produite. Veuillez réessayer.',
      serverError: 'Erreur de connexion au serveur.',
    },
    
    // Thank You
    thankYou: {
      title: 'Merci - Pavillon 46',
      description: 'Merci pour votre demande',
      heading: 'Merci pour votre demande',
      message1: 'Vous recevrez un e-mail de confirmation.',
      message2: 'Nous vous contacterons sous peu.',
    },
    
    // Language Notification
    language: {
      changedToFrench: 'Langue changée en français',
      changedToEnglish: 'Language changed to English',
    },
    
    // Email templates
    email: {
      admin: {
        subject: (name) => `Nouvelle inscription sur la liste d'attente: ${name}`,
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
        greeting: (name) => `Bonjour ${name},`,
        body1: 'Merci de votre intérêt pour <strong>Pavillon 46</strong>. Nous sommes ravis de vous compter parmi les membres de notre liste d\'attente exclusive.',
        body2: 'Notre équipe examine actuellement votre candidature avec attention. Nous vous contacterons très prochainement avec plus d\'informations sur notre adhésion exclusive et les prochaines étapes.',
        body3: 'En attendant, restez à l\'écoute de nos actualités. Nous avons hâte de vous accueillir dans cette expérience unique où la vie prend toutes ses couleurs.',
        closing: 'Avec nos meilleures salutations,',
        team: 'L\'équipe Pavillon 46',
        footer: (year) => `&copy; ${year} Pavillon 46. Tous droits réservés.`,
        location: 'La Croix-sur-Lutry, Suisse',
      },
    },
  },
  
  en: {
    // Common
    common: {
      legal: 'Legal',
      privacy: 'Privacy Notice',
      goBack: '← Go Back',
      haveCode: 'I have a code',
      alreadyMember: 'Already a member?',
    },
    
    // Homepage
    home: {
      title: 'Pavillon 46',
      description: 'Welcome to Pavillon 46 - Life in Full Color',
      openingDate: 'Opening Summer 2027',
      welcomeText: 'Welcome to',
      sloganPart1: 'Life in',
      sloganPart2: 'Full Color',
      joinButton: 'Join the Waitlist',
      footerText: 'Access by invitation, with limited membership',
    },
    
    // Waitlist
    waitlist: {
      title: 'Join the Waitlist - Pavillon 46',
      description: 'Join the waitlist for Pavillon 46',
      heading: 'Something exclusive is coming',
      fullNamePlaceholder: 'Your Full Name',
      phonePlaceholder: 'Your Phone Number',
      emailPlaceholder: 'Your Email Address',
      postalCodePlaceholder: 'Your Postal Code',
      submitButton: 'Join the Waitlist',
      submitting: 'Joining...',
      errorMessage: 'Something went wrong. Please try again.',
      serverError: 'Error connecting to the server.',
    },
    
    // Thank You
    thankYou: {
      title: 'Thank You - Pavillon 46',
      description: 'Thank you for your inquiry',
      heading: 'Thank you for your inquiry',
      message1: 'You\'ll receive a confirmation email.',
      message2: 'We will contact you shortly.',
    },
    
    // Language Notification
    language: {
      changedToFrench: 'Langue changée en français',
      changedToEnglish: 'Language changed to English',
    },
    
    // Email templates
    email: {
      admin: {
        subject: (name) => `New Waitlist Signup: ${name}`,
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
        greeting: (name) => `Hello ${name},`,
        body1: 'Thank you for your interest in <strong>Pavillon 46</strong>. We are delighted to have you join our exclusive waitlist.',
        body2: 'Our team is currently reviewing your application with care. We will contact you very soon with more information about our exclusive membership and next steps.',
        body3: 'In the meantime, stay tuned for our updates. We look forward to welcoming you to this unique experience where life comes in full color.',
        closing: 'With warm regards,',
        team: 'The Pavillon 46 Team',
        footer: (year) => `&copy; ${year} Pavillon 46. All rights reserved.`,
        location: 'La Croix-sur-Lutry, Switzerland',
      },
    },
  },
}

/**
 * Get translation for a specific language and path
 * @param {string} language - 'fr' or 'en'
 * @param {string} path - Dot-separated path (e.g., 'home.title')
 * @returns {string|function} Translation value
 */
export function getTranslation(language, path) {
  const keys = path.split('.')
  let value = translations[language] || translations.fr
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key]
    } else {
      // Fallback to French if key not found
      value = translations.fr
      for (const fallbackKey of keys) {
        if (value && typeof value === 'object' && fallbackKey in value) {
          value = value[fallbackKey]
        } else {
          return path // Return path if translation not found
        }
      }
      break
    }
  }
  
  return value
}

/**
 * Hook-like function to get translations for a component
 * @param {string} language - 'fr' or 'en'
 * @param {string} section - Section name (e.g., 'home', 'waitlist')
 * @returns {object} Translations object for that section
 */
export function useTranslations(language, section) {
  return translations[language]?.[section] || translations.fr[section] || {}
}
