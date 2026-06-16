// Centralized translations for Pavillon 46 — full FR/EN copy ported from the
// original Next.js project (lib/translations.js).

export type Language = 'fr' | 'en'

export interface HearAboutOptions {
  social: string
  friends: string
  press: string
  other: string
}

export interface CommonTranslations {
  legal: string
  privacy: string
  goBack: string
  haveCode: string
  alreadyMember: string
  asSeenOnElle: string
  memberPortal: string
  byInvitation: string
}

export interface HomeTranslations {
  title: string
  description: string
  openingDate: string
  welcomeText: string
  sloganPart1: string
  sloganPart2: string
  sloganPart3: string
  joinButton: string
  footerText: string
}

export interface WaitlistTranslations {
  title: string
  description: string
  heading: string
  firstNamePlaceholder: string
  lastNamePlaceholder: string
  phonePlaceholder: string
  emailPlaceholder: string
  postalCodePlaceholder: string
  referralCodePlaceholder: string
  submitButton: string
  continueButton: string
  backButton: string
  submitting: string
  errorMessage: string
  serverError: string
  stepName: string
  stepEmail: string
  stepSource: string
  stepPhone: string
  stepVerify: string
  emailStepDescription: string
  hearAboutStepDescription: string
  hearAboutLabel: string
  hearAboutPlaceholder: string
  hearAboutValidationSelect: string
  hearAboutOtherPlaceholder: string
  hearAboutOptions: HearAboutOptions
  phoneStepDescription: string
  sendingCode: string
  codeSentTo: string
  codePlaceholder: string
  verifyCode: string
  resendCode: string
  resendIn: string
  invalidCode: string
  codeExpired: string
  verifyError: string
  phoneVerifiedRetry: string
  retrySubmit: string
}

export interface LoginTranslations {
  title: string
  description: string
  heading: string
  subtitle: string
  logoAlt: string
  accountPlaceholder: string
  passwordPlaceholder: string
  submitButton: string
  loading: string
  showPassword: string
  hidePassword: string
  validationError: string
  successMessage: string
  joinWaitlistLink: string
  failed: string
}

export interface DashboardTranslations {
  navOverview: string
  navReferral: string
  navReferrals: string
  navProfile: string
  navEvents: string
  signOut: string
  greeting: string
  memberLabel: string
  loading: string
  loadError: string
  copy: string
  copied: string
  copyLink: string
  linkCopied: string
  inviteWaysTitle: string
  inviteWaysSub: string
  inviteWaysEyebrow: string
  methodForm: string
  methodCode: string
  // Welcome (portal home)
  welcomeHeading: string
  welcomeSub: string
  // Set password (forced reset)
  setPwTitle: string
  setPwSubtitle: string
  newPassword: string
  confirmPassword: string
  setPwSubmit: string
  setPwSaving: string
  setPwMismatch: string
  setPwTooShort: string
  // Overview
  overviewTitle: string
  overviewSubtitle: string
  statReferrals: string
  statAccepted: string
  statBonus: string
  yourCode: string
  referralCardTitle: string
  referralCardText: string
  referralCardButton: string
  openingTitle: string
  openingText: string
  // Referral form
  referralTitle: string
  referralSubtitle: string
  fldFirstName: string
  fldLastName: string
  fldEmail: string
  fldPhone: string
  fldCity: string
  fldMessage: string
  submit: string
  submitting: string
  errRequiredName: string
  errRequiredContact: string
  successTitle: string
  successText: string
  codeLabel: string
  applicationLabel: string
  shareLabel: string
  referAnother: string
  referSuccessTitle: string
  referSuccessBody: string
  rewardTitle: string
  rewardText: string
  rewardShort: string
  rewardEyebrow: string
  rewardYou: string
  rewardGuest: string
  rewardMonthFree: string
  // My referrals
  referralsTitle: string
  referralsSubtitle: string
  referralsEmpty: string
  colName: string
  colContact: string
  colDate: string
  colStatus: string
  statusPending: string
  statusReviewing: string
  statusAccepted: string
  statusDeclined: string
  totalLabel: string
  acceptedLabel: string
  bonusLabel: string
  // Profile
  profileTitle: string
  profileSubtitle: string
  fldCountry: string
  fldLanguage: string
  emailReadonly: string
  save: string
  saving: string
  saved: string
  // Events
  eventsTitle: string
  eventsSubtitle: string
  eventsEmpty: string
}

export interface ThankYouTranslations {
  title: string
  description: string
  heading: string
  message1: string
  message2: string
}

export interface LegalOrPrivacyTranslations {
  title: string
  description: string
  heading: string
  lastUpdated: string
  intro?: string
  section1Title: string
  section1Content: string
  section2Title: string
  section2Content: string
  section3Title: string
  section3Content: string
  section4Title: string
  section4Content: string
  section5Title: string
  section5Content: string
  section6Title: string
  section6Content: string
  section7Title: string
  section7Content: string
  section8Title: string
  section8Content: string
  section9Title: string
  section9Content: string
  contactEmail: string
  location: string
}

export interface Translations {
  common: CommonTranslations
  home: HomeTranslations
  waitlist: WaitlistTranslations
  login: LoginTranslations
  dashboard: DashboardTranslations
  thankYou: ThankYouTranslations
  privacy: LegalOrPrivacyTranslations
  legal: LegalOrPrivacyTranslations
}

export const translations: Record<Language, Translations> = {
  fr: {
    common: {
      legal: 'Mentions légales',
      privacy: 'Politique de confidentialité',
      goBack: '← Retour',
      haveCode: "J'ai un code",
      alreadyMember: 'Déjà membre ?',
      asSeenOnElle: 'Vu dans ELLE',
      memberPortal: 'Espace membre',
      byInvitation: 'Sur invitation',
    },
    home: {
      title: 'Pavillon 46',
      description: 'Bienvenue au Pavillon 46 - La vie pleine de couleurs',
      openingDate: 'Ouverture fin 2027',
      welcomeText: 'Bienvenue au',
      sloganPart1: 'La vie',
      sloganPart2: 'pleine de',
      sloganPart3: 'couleurs',
      joinButton: "Rejoindre la liste d'attente",
      footerText: "Accès sur invitation, avec un nombre limité de membres",
    },
    waitlist: {
      title: "Rejoindre la liste d'attente - Pavillon 46",
      description: "Rejoignez la liste d'attente pour Pavillon 46",
      heading: "Quelque chose d'unique se profile",
      firstNamePlaceholder: 'Votre prénom',
      lastNamePlaceholder: 'Votre nom de famille',
      phonePlaceholder: 'Votre numéro de téléphone',
      emailPlaceholder: 'Votre adresse e-mail',
      postalCodePlaceholder: 'Votre code postal',
      referralCodePlaceholder: 'Code de parrainage (optionnel)',
      submitButton: "Rejoindre la liste d'attente",
      continueButton: 'Continuer',
      backButton: 'Retour',
      submitting: 'Inscription en cours...',
      errorMessage: "Une erreur s'est produite. Veuillez réessayer.",
      serverError: 'Erreur de connexion au serveur.',
      stepName: 'Nom',
      stepEmail: 'Contact',
      stepSource: 'Source',
      stepPhone: 'Téléphone',
      stepVerify: 'Vérification',
      emailStepDescription: 'Indiquez votre adresse e-mail et votre code postal.',
      hearAboutStepDescription: 'Comment avez-vous entendu parler de Pavillon 46 ?',
      hearAboutLabel: 'Comment avez-vous entendu parler de Pavillon 46 ?',
      hearAboutPlaceholder: 'Choisissez une option',
      hearAboutValidationSelect: 'Veuillez indiquer comment vous avez entendu parler de nous.',
      hearAboutOtherPlaceholder: 'Précisez (optionnel)…',
      hearAboutOptions: {
        social: 'Réseaux sociaux',
        friends: 'Famille et amis',
        press: 'Dans la presse',
        other: 'Autre',
      },
      phoneStepDescription: 'Entrez votre numéro de téléphone pour recevoir un code de vérification.',
      sendingCode: 'Envoi...',
      codeSentTo: 'Un code a été envoyé au',
      codePlaceholder: 'Entrez le code',
      verifyCode: 'Confirmer',
      resendCode: 'Renvoyer le code',
      resendIn: 'Renvoyer dans',
      invalidCode: 'Le code est incorrect. Veuillez réessayer.',
      codeExpired: 'Le code a expiré. Veuillez en demander un nouveau.',
      verifyError: "Impossible d'envoyer le code. Veuillez réessayer.",
      phoneVerifiedRetry: 'Votre téléphone est vérifié. Cliquez ci-dessous pour réessayer.',
      retrySubmit: 'Réessayer',
    },
    login: {
      title: 'Connexion membre - Pavillon 46',
      description: "Connectez-vous à l'espace membre Pavillon 46",
      heading: 'Espace membre',
      subtitle: 'Connectez-vous pour retrouver votre univers prive.',
      logoAlt: 'PAVILLON 46',
      accountPlaceholder: 'Compte ou e-mail',
      passwordPlaceholder: 'Mot de passe',
      submitButton: 'Se connecter',
      loading: 'Connexion...',
      showPassword: 'Afficher',
      hidePassword: 'Masquer',
      validationError: 'Veuillez renseigner votre compte et votre mot de passe.',
      successMessage: 'Portail prive en cours de finalisation. Votre acces sera active tres bientot.',
      joinWaitlistLink: "Pas encore membre ? Rejoindre la liste d'attente",
      failed: 'E-mail ou mot de passe incorrect.',
    },
    dashboard: {
      navOverview: 'Accueil',
      navReferral: 'Parrainage',
      navReferrals: 'Mes parrainages',
      navProfile: 'Profil',
      navEvents: 'Actualités',
      signOut: 'Se déconnecter',
      greeting: 'Bienvenue,',
      memberLabel: 'Membre fondateur',
      loading: 'Chargement…',
      loadError: 'Impossible de charger les données. Veuillez réessayer.',
      copy: 'Copier',
      copied: 'Copié',
      copyLink: 'Copier le lien',
      linkCopied: 'Lien copié',
      inviteWaysTitle: "Deux façons d'inviter",
      inviteWaysSub: 'Parrainez directement avec leurs coordonnées, ou partagez votre code personnel.',
      inviteWaysEyebrow: 'Inviter',
      methodForm: 'Avec leurs coordonnées',
      methodCode: 'Avec votre code',
      welcomeHeading: 'Bienvenue au Pavillon 46,',
      welcomeSub: 'Votre espace membre privé. Parrainez une personne de confiance.',
      setPwTitle: 'Définissez votre mot de passe',
      setPwSubtitle: 'Pour votre sécurité, choisissez un nouveau mot de passe avant de continuer.',
      newPassword: 'Nouveau mot de passe',
      confirmPassword: 'Confirmer le mot de passe',
      setPwSubmit: 'Enregistrer et continuer',
      setPwSaving: 'Enregistrement…',
      setPwMismatch: 'Les mots de passe ne correspondent pas.',
      setPwTooShort: 'Le mot de passe doit contenir au moins 8 caractères.',
      overviewTitle: 'Votre espace membre',
      overviewSubtitle: 'Bienvenue dans le cercle privé du Pavillon 46.',
      statReferrals: 'Parrainages',
      statAccepted: 'Acceptés',
      statBonus: 'Mois offerts',
      yourCode: 'Votre code de parrainage',
      referralCardTitle: 'Parrainez une personne de confiance',
      referralCardText: "L'accès au Pavillon 46 se fait sur invitation. Parrainez une personne — à la signature de son contrat, vous recevez chacun un mois offert.",
      referralCardButton: 'Parrainer maintenant',
      openingTitle: 'Ouverture fin 2027',
      openingText: 'Le Pavillon 46 ouvrira ses portes fin 2027 à La Croix-sur-Lutry. Les membres bénéficient d\'un accès prioritaire.',
      referralTitle: 'Parrainer un membre fondateur',
      referralSubtitle: 'Recommandez une personne pour devenir membre fondateur. Vous recevrez un code de parrainage.',
      fldFirstName: 'Prénom',
      fldLastName: 'Nom',
      fldEmail: 'Adresse e-mail',
      fldPhone: 'Numéro de téléphone',
      fldCity: 'Ville',
      fldMessage: 'Message (optionnel)',
      submit: 'Envoyer le parrainage',
      submitting: 'Envoi…',
      errRequiredName: 'Veuillez indiquer le prénom et le nom.',
      errRequiredContact: 'Veuillez indiquer au moins un e-mail ou un téléphone.',
      successTitle: 'Parrainage enregistré',
      successText: 'Votre recommandation a bien été transmise. Voici votre code de parrainage.',
      codeLabel: 'Code de parrainage',
      applicationLabel: 'Référence de candidature',
      shareLabel: 'Lien de partage',
      referAnother: 'Parrainer une autre personne',
      referSuccessTitle: 'Parrainage envoyé',
      referSuccessBody: 'Vous avez parrainé {name} avec succès. Nous le ou la contacterons très prochainement.',
      rewardTitle: 'Un mois offert, pour vous deux',
      rewardText: "Lorsque la personne que vous parrainez signe son contrat de membre, vous et votre invité bénéficiez chacun d'un mois gratuit.",
      rewardShort: 'À la signature de son contrat, vous recevez chacun un mois offert.',
      rewardEyebrow: 'Récompense de parrainage',
      rewardYou: 'Vous',
      rewardGuest: 'Votre invité',
      rewardMonthFree: '1 mois offert',
      referralsTitle: 'Mes parrainages',
      referralsSubtitle: 'Suivez les candidatures des personnes que vous avez parrainées.',
      referralsEmpty: "Vous n'avez encore parrainé personne.",
      colName: 'Nom',
      colContact: 'Contact',
      colDate: 'Date',
      colStatus: 'Statut',
      statusPending: 'En attente',
      statusReviewing: 'En examen',
      statusAccepted: 'Accepté',
      statusDeclined: 'Refusé',
      totalLabel: 'Total',
      acceptedLabel: 'Acceptés',
      bonusLabel: 'Mois offerts',
      profileTitle: 'Mon profil',
      profileSubtitle: 'Gérez vos informations personnelles.',
      fldCountry: 'Pays',
      fldLanguage: 'Langue préférée',
      emailReadonly: "L'adresse e-mail ne peut pas être modifiée. Contactez le Pavillon 46.",
      save: 'Enregistrer',
      saving: 'Enregistrement…',
      saved: 'Modifications enregistrées',
      eventsTitle: 'Actualités & événements',
      eventsSubtitle: 'Les nouvelles réservées aux membres du Pavillon 46.',
      eventsEmpty: 'Aucune actualité pour le moment.',
    },
    thankYou: {
      title: 'Merci - Pavillon 46',
      description: 'Merci pour votre demande',
      heading: 'Merci pour votre demande',
      message1: 'Vous recevrez un e-mail de confirmation.',
      message2: 'Nous vous contacterons sous peu.',
    },
    privacy: {
      title: 'Politique de confidentialité - Pavillon 46',
      description: 'Politique de confidentialité de Pavillon 46',
      heading: 'Politique de confidentialité',
      lastUpdated: 'Dernière mise à jour:',
      intro: "Chez Pavillon 46, nous accordons une grande importance à la protection de vos données personnelles. Cette politique de confidentialité explique comment nous collectons, utilisons, stockons et protégeons vos informations.",
      section1Title: '1. Collecte des données',
      section1Content: "Nous collectons les informations que vous nous fournissez directement lorsque vous vous inscrivez sur notre liste d'attente, notamment votre nom, votre adresse e-mail, votre numéro de téléphone et votre code postal.",
      section2Title: '2. Utilisation des données',
      section2Content: "Vos données personnelles sont utilisées exclusivement pour gérer votre inscription sur notre liste d'attente, vous contacter concernant votre candidature et vous informer des actualités de Pavillon 46.",
      section3Title: '3. Protection des données',
      section3Content: "Nous mettons en œuvre des mesures de sécurité techniques et organisationnelles appropriées pour protéger vos données personnelles contre tout accès non autorisé, perte, destruction ou altération.",
      section4Title: '4. Partage des données',
      section4Content: "Nous ne vendons, ne louons ni ne partageons vos données personnelles avec des tiers, sauf si la loi l'exige ou si vous avez donné votre consentement explicite.",
      section5Title: '5. Vos droits',
      section5Content: "Conformément à la législation suisse et européenne sur la protection des données, vous avez le droit d'accéder, de rectifier, de supprimer ou de limiter le traitement de vos données personnelles. Vous pouvez également vous opposer au traitement de vos données ou demander leur portabilité.",
      section6Title: '6. Conservation des données',
      section6Content: 'Nous conservons vos données personnelles aussi longtemps que nécessaire pour les finalités pour lesquelles elles ont été collectées, ou conformément aux obligations légales applicables.',
      section7Title: '7. Cookies et mesure d’audience',
      section7Content: "Notre site peut utiliser des cookies ou le stockage local du navigateur pour des fonctions essentielles (par ex. mémoriser la langue). Nous n’intégrons pas Google Analytics ni de pixels publicitaires. Une mesure d’audience technique, hébergée sur nos propres serveurs, enregistre des statistiques agrégées (pages consultées, clics sur certains éléments, domaine du site d’origine). Les adresses IP sont traitées sous forme hachée ; les libellés de clics sont limités en taille et filtrés pour limiter les données personnelles accidentelles.",
      section8Title: '8. Modifications',
      section8Content: 'Nous nous réservons le droit de modifier cette politique de confidentialité à tout moment. Les modifications seront publiées sur cette page avec une date de mise à jour révisée.',
      section9Title: '9. Contact',
      section9Content: "Pour toute question concernant cette politique de confidentialité ou pour exercer vos droits, veuillez nous contacter à l'adresse suivante:",
      contactEmail: 'contact@pavillon46.ch',
      location: 'La Croix-sur-Lutry, Suisse',
    },
    legal: {
      title: 'Mentions légales - Pavillon 46',
      description: 'Mentions légales de Pavillon 46',
      heading: 'Mentions légales',
      lastUpdated: 'Dernière mise à jour:',
      section1Title: '1. Informations légales',
      section1Content: 'Le présent site web est la propriété de Pavillon 46, situé à La Croix-sur-Lutry, Suisse.',
      section2Title: '2. Éditeur du site',
      section2Content: 'Directeur de la publication: Pavillon 46',
      section3Title: '3. Hébergement',
      section3Content: 'Ce site est hébergé sur Azure Static Web Apps, une plateforme cloud de Microsoft Corporation.',
      section4Title: '4. Propriété intellectuelle',
      section4Content: "L'ensemble du contenu de ce site (textes, images, logos, graphismes, etc.) est la propriété exclusive de Pavillon 46 et est protégé par les lois suisses et internationales sur la propriété intellectuelle. Toute reproduction, distribution, modification ou utilisation non autorisée est strictement interdite.",
      section5Title: '5. Responsabilité',
      section5Content: "Pavillon 46 s'efforce de fournir des informations exactes et à jour sur ce site. Cependant, nous ne pouvons garantir l'exactitude, l'exhaustivité ou l'actualité des informations. L'utilisation de ce site se fait à vos propres risques.",
      section6Title: '6. Liens externes',
      section6Content: "Ce site peut contenir des liens vers des sites web externes. Pavillon 46 n'est pas responsable du contenu ou des pratiques de confidentialité de ces sites tiers.",
      section7Title: '7. Protection des données',
      section7Content: 'Le traitement de vos données personnelles est régi par notre Politique de confidentialité, disponible sur ce site.',
      section8Title: '8. Droit applicable',
      section8Content: 'Les présentes mentions légales sont régies par le droit suisse. Tout litige relatif à ce site sera soumis à la juridiction exclusive des tribunaux suisses.',
      section9Title: '9. Contact',
      section9Content: 'Pour toute question concernant ces mentions légales, veuillez nous contacter à:',
      contactEmail: 'contact@pavillon46.ch',
      location: 'La Croix-sur-Lutry, Suisse',
    },
  },
  en: {
    common: {
      legal: 'Legal',
      privacy: 'Privacy Notice',
      goBack: '← Go Back',
      haveCode: 'I have a code',
      alreadyMember: 'Already a member?',
      asSeenOnElle: 'As seen on ELLE',
      memberPortal: "Member's Portal",
      byInvitation: 'By invitation',
    },
    home: {
      title: 'Pavillon 46',
      description: 'Welcome to Pavillon 46 - Life in Full Color',
      openingDate: 'Opening end of 2027',
      welcomeText: 'Welcome to',
      sloganPart1: 'Life in',
      sloganPart2: 'Full',
      sloganPart3: 'Color',
      joinButton: 'Join the Waitlist',
      footerText: 'Access is by invitation, with limited memberships.',
    },
    waitlist: {
      title: 'Join the Waitlist - Pavillon 46',
      description: 'Join the waitlist for Pavillon 46',
      heading: 'Something unique is coming',
      firstNamePlaceholder: 'Your First Name',
      lastNamePlaceholder: 'Your Last Name',
      phonePlaceholder: 'Your Phone Number',
      emailPlaceholder: 'Your Email Address',
      postalCodePlaceholder: 'Your Postal Code',
      referralCodePlaceholder: 'Referral code (optional)',
      submitButton: 'Join the Waitlist',
      continueButton: 'Continue',
      backButton: 'Back',
      submitting: 'Joining...',
      errorMessage: 'Something went wrong. Please try again.',
      serverError: 'Error connecting to the server.',
      stepName: 'Name',
      stepEmail: 'Contact',
      stepSource: 'Source',
      stepPhone: 'Phone',
      stepVerify: 'Verify',
      emailStepDescription: 'Enter your email address and postal code.',
      hearAboutStepDescription: 'Tell us how you heard about Pavillon 46.',
      hearAboutLabel: 'How did you hear about Pavillon 46?',
      hearAboutPlaceholder: 'Select an option',
      hearAboutValidationSelect: 'Please tell us how you heard about us.',
      hearAboutOtherPlaceholder: 'Tell us more (optional)…',
      hearAboutOptions: {
        social: 'Social media',
        friends: 'Friends and family',
        press: 'Press',
        other: 'Other',
      },
      phoneStepDescription: 'Enter your phone number to receive a verification code.',
      sendingCode: 'Sending...',
      codeSentTo: 'A code has been sent to',
      codePlaceholder: 'Enter code',
      verifyCode: 'Confirm',
      resendCode: 'Resend code',
      resendIn: 'Resend in',
      invalidCode: 'The code is wrong. Please try again.',
      codeExpired: 'The code has expired. Please request a new one.',
      verifyError: 'Could not send code. Please try again.',
      phoneVerifiedRetry: 'Your phone is verified. Click below to retry.',
      retrySubmit: 'Retry',
    },
    login: {
      title: 'Member Login - Pavillon 46',
      description: 'Sign in to the Pavillon 46 member area',
      heading: 'Member Login',
      subtitle: 'Sign in to access your private member space.',
      logoAlt: 'PAVILLON 46',
      accountPlaceholder: 'Account or email',
      passwordPlaceholder: 'Password',
      submitButton: 'Sign in',
      loading: 'Signing in...',
      showPassword: 'Show',
      hidePassword: 'Hide',
      validationError: 'Please enter both account and password.',
      successMessage: 'The private portal is being finalized. Your access will be enabled very soon.',
      joinWaitlistLink: 'Not a member yet? Join the waitlist',
      failed: 'Invalid email or password.',
    },
    dashboard: {
      navOverview: 'Overview',
      navReferral: 'Refer',
      navReferrals: 'My referrals',
      navProfile: 'Profile',
      navEvents: 'News',
      signOut: 'Sign out',
      greeting: 'Welcome back,',
      memberLabel: 'Founding Member',
      loading: 'Loading…',
      loadError: 'Could not load data. Please try again.',
      copy: 'Copy',
      copied: 'Copied',
      copyLink: 'Copy link',
      linkCopied: 'Link copied',
      inviteWaysTitle: 'Two ways to invite',
      inviteWaysSub: 'Refer someone directly with their details, or share your personal code.',
      inviteWaysEyebrow: 'Invite',
      methodForm: 'By their details',
      methodCode: 'With your code',
      welcomeHeading: 'Welcome to Pavillon 46,',
      welcomeSub: 'Your private member space. Refer someone you trust.',
      setPwTitle: 'Set your password',
      setPwSubtitle: 'For your security, choose a new password before continuing.',
      newPassword: 'New password',
      confirmPassword: 'Confirm password',
      setPwSubmit: 'Save and continue',
      setPwSaving: 'Saving…',
      setPwMismatch: 'The passwords do not match.',
      setPwTooShort: 'Password must be at least 8 characters.',
      overviewTitle: 'Your member area',
      overviewSubtitle: 'Welcome to the private circle of Pavillon 46.',
      statReferrals: 'Referrals',
      statAccepted: 'Accepted',
      statBonus: 'Free months',
      yourCode: 'Your referral code',
      referralCardTitle: 'Refer someone you trust',
      referralCardText: 'Access to Pavillon 46 is by invitation. Refer someone — when they sign their contract, you each get a month free.',
      referralCardButton: 'Refer now',
      openingTitle: 'Opening end of 2027',
      openingText: 'Pavillon 46 will open at the end of 2027 in La Croix-sur-Lutry. Members enjoy priority access.',
      referralTitle: 'Refer a founding member',
      referralSubtitle: 'Recommend someone to become a founding member. You will receive a referral code.',
      fldFirstName: 'First name',
      fldLastName: 'Last name',
      fldEmail: 'Email address',
      fldPhone: 'Phone number',
      fldCity: 'City',
      fldMessage: 'Message (optional)',
      submit: 'Send referral',
      submitting: 'Sending…',
      errRequiredName: 'Please provide the first and last name.',
      errRequiredContact: 'Please provide at least an email or a phone number.',
      successTitle: 'Referral recorded',
      successText: 'Your recommendation has been submitted. Here is your referral code.',
      codeLabel: 'Referral code',
      applicationLabel: 'Application reference',
      shareLabel: 'Share link',
      referAnother: 'Refer another person',
      referSuccessTitle: 'Referral sent',
      referSuccessBody: 'You have successfully referred {name}. We will contact them shortly.',
      rewardTitle: 'A month on us — for both of you',
      rewardText: 'When the person you refer signs their membership contract, you and your guest each receive one month free.',
      rewardShort: 'When they sign their contract, you each get one month free.',
      rewardEyebrow: 'Referral reward',
      rewardYou: 'You',
      rewardGuest: 'Your guest',
      rewardMonthFree: '1 month free',
      referralsTitle: 'My referrals',
      referralsSubtitle: 'Track the applications of the people you referred.',
      referralsEmpty: 'You have not referred anyone yet.',
      colName: 'Name',
      colContact: 'Contact',
      colDate: 'Date',
      colStatus: 'Status',
      statusPending: 'Pending',
      statusReviewing: 'Reviewing',
      statusAccepted: 'Accepted',
      statusDeclined: 'Declined',
      totalLabel: 'Total',
      acceptedLabel: 'Accepted',
      bonusLabel: 'Free months',
      profileTitle: 'My profile',
      profileSubtitle: 'Manage your personal information.',
      fldCountry: 'Country',
      fldLanguage: 'Preferred language',
      emailReadonly: 'The email address cannot be changed. Please contact Pavillon 46.',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Changes saved',
      eventsTitle: 'News & events',
      eventsSubtitle: 'Members-only updates from Pavillon 46.',
      eventsEmpty: 'No news at the moment.',
    },
    thankYou: {
      title: 'Thank You - Pavillon 46',
      description: 'Thank you for your inquiry',
      heading: 'Thank you for your inquiry',
      message1: "You'll receive a confirmation email.",
      message2: 'We will contact you shortly.',
    },
    privacy: {
      title: 'Privacy Policy - Pavillon 46',
      description: 'Pavillon 46 Privacy Policy',
      heading: 'Privacy Policy',
      lastUpdated: 'Last updated:',
      intro: 'At Pavillon 46, we take the protection of your personal data very seriously. This privacy policy explains how we collect, use, store, and protect your information.',
      section1Title: '1. Data Collection',
      section1Content: 'We collect information that you provide directly to us when you join our waitlist, including your name, email address, phone number, and postal code.',
      section2Title: '2. Data Usage',
      section2Content: 'Your personal data is used exclusively to manage your waitlist registration, contact you regarding your application, and inform you about Pavillon 46 news.',
      section3Title: '3. Data Protection',
      section3Content: 'We implement appropriate technical and organizational security measures to protect your personal data against unauthorized access, loss, destruction, or alteration.',
      section4Title: '4. Data Sharing',
      section4Content: 'We do not sell, rent, or share your personal data with third parties, except as required by law or with your explicit consent.',
      section5Title: '5. Your Rights',
      section5Content: 'In accordance with Swiss and European data protection legislation, you have the right to access, rectify, delete, or limit the processing of your personal data. You may also object to the processing of your data or request its portability.',
      section6Title: '6. Data Retention',
      section6Content: 'We retain your personal data for as long as necessary for the purposes for which it was collected, or in accordance with applicable legal obligations.',
      section7Title: '7. Cookies and usage measurement',
      section7Content: 'Our site may use cookies or browser local storage for essential features (for example, remembering your language). We do not embed Google Analytics or advertising pixels. We run first-party, server-hosted usage measurement that records aggregated statistics (pages viewed, clicks on certain controls, referring site domain). IP addresses are stored only in hashed form; click labels are length-limited and scrubbed to reduce accidental personal data.',
      section8Title: '8. Modifications',
      section8Content: 'We reserve the right to modify this privacy policy at any time. Changes will be published on this page with a revised update date.',
      section9Title: '9. Contact',
      section9Content: 'For any questions regarding this privacy policy or to exercise your rights, please contact us at:',
      contactEmail: 'contact@pavillon46.ch',
      location: 'La Croix-sur-Lutry, Switzerland',
    },
    legal: {
      title: 'Legal Notice - Pavillon 46',
      description: 'Pavillon 46 Legal Notice',
      heading: 'Legal Notice',
      lastUpdated: 'Last updated:',
      section1Title: '1. Legal Information',
      section1Content: 'This website is the property of Pavillon 46, located in La Croix-sur-Lutry, Switzerland.',
      section2Title: '2. Website Publisher',
      section2Content: 'Publisher: Pavillon 46',
      section3Title: '3. Hosting',
      section3Content: 'This site is hosted on Azure Static Web Apps, a cloud platform by Microsoft Corporation.',
      section4Title: '4. Intellectual Property',
      section4Content: 'All content on this site (texts, images, logos, graphics, etc.) is the exclusive property of Pavillon 46 and is protected by Swiss and international intellectual property laws. Any unauthorized reproduction, distribution, modification, or use is strictly prohibited.',
      section5Title: '5. Liability',
      section5Content: 'Pavillon 46 strives to provide accurate and up-to-date information on this site. However, we cannot guarantee the accuracy, completeness, or timeliness of the information. Use of this site is at your own risk.',
      section6Title: '6. External Links',
      section6Content: 'This site may contain links to external websites. Pavillon 46 is not responsible for the content or privacy practices of these third-party sites.',
      section7Title: '7. Data Protection',
      section7Content: 'The processing of your personal data is governed by our Privacy Policy, available on this site.',
      section8Title: '8. Applicable Law',
      section8Content: 'These legal notices are governed by Swiss law. Any dispute relating to this site shall be subject to the exclusive jurisdiction of Swiss courts.',
      section9Title: '9. Contact',
      section9Content: 'For any questions regarding these legal notices, please contact us at:',
      contactEmail: 'contact@pavillon46.ch',
      location: 'La Croix-sur-Lutry, Switzerland',
    },
  },
}

export function useTranslations<K extends keyof Translations>(
  language: Language,
  section: K,
): Translations[K] {
  return (translations[language] ?? translations.fr)[section]
}
