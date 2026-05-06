# Pavillon 46 - Next.js Website

A modern, elegant, and fully responsive website for **Pavillon 46** - an exclusive membership-based establishment opening in Summer 2027. Built with Next.js 14, featuring bilingual support (French/English), smooth animations, and a complete waitlist management system.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Development](#development)
- [Pages & Routes](#pages--routes)
- [Components](#components)
- [API Endpoints](#api-endpoints)
- [Internationalization (i18n)](#internationalization-i18n)
- [Styling & Animations](#styling--animations)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## 🎯 Overview

Pavillon 46 is a premium membership website that allows visitors to join an exclusive waitlist. The site features:

- **Bilingual Interface**: Full French and English language support with persistent language preferences
- **Waitlist System**: Complete form submission with email notifications via SendGrid
- **Modern UI/UX**: Elegant design with smooth Framer Motion animations
- **Responsive Design**: Fully optimized for desktop, tablet, and mobile devices
- **Azure Deployment**: Configured for Azure Static Web Apps with GitHub Actions CI/CD

### Live Site

- **Production URL**: https://pavillon46.ch
- **Azure Static Web App**: https://kind-hill-0e0617903.1.azurestaticapps.net/

---

## ✨ Features

### Core Features

- ✅ **Next.js 14** with React 18 and App Router support
- ✅ **Multi-language Support** (French/English) with localStorage persistence
- ✅ **Responsive Design** - Mobile-first approach, works on all screen sizes
- ✅ **Framer Motion Animations** - Smooth, performant animations throughout
- ✅ **Email Integration** - SendGrid API for automated email notifications
- ✅ **Centralized Translations** - Easy-to-manage translation system
- ✅ **Reusable Components** - Modular, maintainable component architecture
- ✅ **SEO Optimized** - Proper meta tags and semantic HTML
- ✅ **Accessibility** - ARIA labels and keyboard navigation support

### User Features

- Language switcher in header (FR/EN)
- Waitlist registration form with validation
- Email confirmation for users
- Admin notifications for new signups
- Thank you confirmation page
- Smooth page transitions

### Developer Features

- TypeScript-ready structure (jsconfig.json configured)
- ESLint configuration
- Environment variable management
- Azure deployment configuration
- GitHub Actions workflow for CI/CD

---

## 🛠 Technology Stack

### Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | ^14.0.0 | React framework with SSR and static generation |
| `react` | ^18.2.0 | UI library |
| `react-dom` | ^18.2.0 | React DOM rendering |
| `framer-motion` | ^12.29.0 | Animation library for smooth transitions |
| `@sendgrid/mail` | ^8.1.6 | Email service integration |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `eslint` | ^8.0.0 | Code linting |
| `eslint-config-next` | ^14.0.0 | Next.js ESLint configuration |

### Infrastructure

- **Hosting**: Azure Static Web Apps (Free tier)
- **CI/CD**: GitHub Actions
- **Email Service**: SendGrid
- **Version Control**: Git

---

## 📁 Project Structure

```
pavillon-46/
├── .github/
│   └── workflows/
│       └── azure-static-web-app.yml    # GitHub Actions deployment workflow
│
├── azure/
│   ├── main.bicep                      # Azure infrastructure as code
│   ├── main.json                       # Compiled Bicep template
│   ├── main.parameters.json            # Azure deployment parameters
│   └── README.md                       # Azure deployment documentation
│
├── components/
│   ├── layouts/
│   │   └── PageLayout.js               # Reusable page wrapper (Header + Footer)
│   ├── Footer.js                       # Site footer component
│   ├── Header.js                       # Site header with logo and language switcher
│   └── LanguageNotification.js        # Language change notification toast
│
├── contexts/
│   └── LanguageContext.js              # React Context for language state management
│
├── lib/
│   ├── constants.js                    # App constants, animation variants, image paths
│   └── translations.js                 # Centralized translation system (FR/EN)
│
├── pages/
│   ├── api/
│   │   └── send-email.js               # API route for email sending (SendGrid)
│   ├── _app.js                         # Next.js app wrapper (global providers, styles)
│   ├── _document.js                    # Custom HTML document structure
│   ├── index.js                        # Homepage (landing page)
│   ├── waitlist.js                     # Waitlist registration form page
│   └── thank-you.js                    # Thank you confirmation page
│
├── public/
│   ├── fonts/                          # Custom font files (Sogo font family)
│   ├── images/                         # Image assets (logos, backgrounds, icons)
│   └── favicon.ico                     # Site favicon
│
├── styles/
│   └── globals.css                     # Global CSS styles and responsive design
│
├── .gitignore                          # Git ignore rules
├── jsconfig.json                       # JavaScript/TypeScript configuration
├── next.config.js                      # Next.js configuration
├── package.json                        # Project dependencies and scripts
└── README.md                           # This file
```

### Directory Details

#### `/pages`
Next.js file-based routing. Each `.js` file in this directory becomes a route:
- `index.js` → `/` (homepage)
- `waitlist.js` → `/waitlist`
- `thank-you.js` → `/thank-you`
- `api/send-email.js` → `/api/send-email` (API endpoint)

#### `/components`
Reusable React components:
- **Layouts**: Shared page structure components
- **Header**: Navigation and language switcher
- **Footer**: Site footer with legal links
- **LanguageNotification**: Toast notification for language changes

#### `/contexts`
React Context providers for global state:
- **LanguageContext**: Manages current language (fr/en) and persistence

#### `/lib`
Utility functions and shared code:
- **constants.js**: Animation variants, image paths, app constants
- **translations.js**: Complete translation system with helper functions

#### `/public`
Static assets served directly:
- **fonts/**: Custom Sogo font files (WOFF2 format)
- **images/**: All image assets (PNG, SVG formats)

#### `/styles`
Global CSS stylesheet with:
- CSS custom properties (variables)
- Responsive breakpoints
- Component-specific styles
- Animation utilities

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: Version 18.x or higher
- **npm**: Version 9.x or higher (comes with Node.js)
- **Git**: For version control
- **SendGrid Account**: For email functionality (free tier available)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd pavillon-46
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env.local` file in the root directory:
   ```env
   SENDGRID_API_KEY=your_sendgrid_api_key_here
   ADMIN_EMAIL=admin@example.com
   FROM_EMAIL=noreply@example.com
   ```
   
   > **Note**: Never commit `.env.local` to version control. It's already in `.gitignore`.

4. **Add font files** (optional)
   
   Place Sogo font files in `public/fonts/`:
   - `Sogo-Regular.woff2`
   - `Sogo-Medium.woff2`
   - `Sogo-SemiBold.woff2`
   - `Sogo-Bold.woff2`
   
   If fonts are missing, the site will fall back to system fonts.

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

---

## ⚙️ Configuration

### Environment Variables

Create a `.env.local` file in the project root with the following variables:

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `SENDGRID_API_KEY` | SendGrid API key for email sending | Yes | `SG.xxxxxxxxxxxxx` |
| `ADMIN_EMAIL` | Email address to receive waitlist notifications | Yes | `admin@pavillon46.ch` |
| `FROM_EMAIL` | Email address used as sender (must be verified in SendGrid) | Yes | `noreply@pavillon46.ch` |
| `ACTIVITY_REPORT_KEY` | Secret key to access activity report endpoints | Yes (activity reporting) | `long-random-secret` |
| `ACTIVITY_DAILY_REPORT_TO` | Daily report recipient (end of day summary) | No | `pierre.boissart@pavillon46.ch` |

#### Getting SendGrid API Key

1. Sign up at [SendGrid](https://sendgrid.com) (free tier: 100 emails/day)
2. Go to **Settings** → **API Keys**
3. Click **Create API Key**
4. Give it a name (e.g., "Pavillon 46 Website")
5. Select **Full Access** or **Restricted Access** (Mail Send permission required)
6. Copy the API key and add it to `.env.local`

#### Verifying Sender Email

1. In SendGrid, go to **Settings** → **Sender Authentication**
2. Click **Verify a Single Sender**
3. Enter the email address you want to use as `FROM_EMAIL`
4. Complete the verification process

### Next.js Configuration

The `next.config.js` file contains:

```javascript
{
  reactStrictMode: true,      // React strict mode enabled
  images: {
    unoptimized: true,        // Disable Next.js image optimization (for static export)
    domains: [],              // Allowed image domains (empty = same origin only)
  }
}
```

### Font Configuration

Custom fonts are loaded in `pages/_document.js`. To add or modify fonts:

1. Place font files in `public/fonts/`
2. Update the `@font-face` declarations in `pages/_document.js`
3. Update CSS variables in `styles/globals.css` if needed

---

## 💻 Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on http://localhost:3000 |
| `npm run build` | Create production build |
| `npm start` | Start production server (after build) |
| `npm run lint` | Run ESLint to check code quality |

### Development Workflow

1. **Start the dev server**
   ```bash
   npm run dev
   ```

2. **Make changes**
   - Edit files in `pages/`, `components/`, `styles/`, etc.
   - Changes auto-reload in the browser (Hot Module Replacement)

3. **Test locally**
   - Test all pages: `/`, `/waitlist`, `/thank-you`
   - Test language switching
   - Test form submission (requires SendGrid API key)

4. **Build for production**
   ```bash
   npm run build
   npm start
   ```

### Code Style

- Use functional components with React Hooks
- Follow Next.js conventions (file-based routing)
- Use semantic HTML and ARIA labels for accessibility
- Keep components small and focused
- Centralize translations in `lib/translations.js`

### Adding New Pages

1. Create a new `.js` file in `pages/`
2. Use the `PageLayout` component for consistent structure
3. Add translations in `lib/translations.js`
4. Add styles in `styles/globals.css`

Example:
```javascript
import PageLayout from '../components/layouts/PageLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'

export default function NewPage() {
  const { language } = useLanguage()
  const t = useTranslations(language, 'newPage')
  
  return (
    <PageLayout>
      <div className="new-page">
        <h1>{t.title}</h1>
      </div>
    </PageLayout>
  )
}
```

---

## 📄 Pages & Routes

### Homepage (`/`)

**File**: `pages/index.js`

- **Purpose**: Landing page with brand introduction
- **Features**:
  - Split-screen design with background image
  - Logo display with animation
  - Opening date announcement (Summer 2027)
  - Call-to-action button to join waitlist
  - Legal text in footer
- **Layout**: Full-page layout without footer (`showFooter={false}`)

### Waitlist Page (`/waitlist`)

**File**: `pages/waitlist.js`

- **Purpose**: Registration form for waitlist
- **Features**:
  - Form with 4 fields: Full Name, Phone, Email, Postal Code
  - Client-side validation (required fields)
  - Loading state during submission
  - Error handling
  - Links to "Have a code" and "Already a member" (placeholder)
  - Back link to homepage
- **Form Submission**:
  - Sends POST request to `/api/send-email`
  - Includes language preference
  - Redirects to `/thank-you` on success

### Thank You Page (`/thank-you`)

**File**: `pages/thank-you.js`

- **Purpose**: Confirmation page after form submission
- **Features**:
  - Success message
  - Animated checkmark icon
  - Confirmation text
  - Same background as waitlist page

### API Route (`/api/send-email`)

**File**: `pages/api/send-email.js`

- **Method**: POST only
- **Purpose**: Handle waitlist form submissions and send emails
- **Request Body**:
  ```json
  {
    "fullName": "John Doe",
    "phoneNumber": "+1234567890",
    "emailAddress": "john@example.com",
    "postalCode": "12345",
    "language": "en"
  }
  ```
- **Response**:
  - `200`: Emails sent successfully
  - `405`: Method not allowed
  - `500`: Server error (missing env vars or SendGrid error)
- **Email Behavior**:
  - Sends confirmation email to user
  - Sends notification email to admin
  - Both emails are in the user's selected language

---

## 🧩 Components

### PageLayout

**File**: `components/layouts/PageLayout.js`

Reusable wrapper component that provides consistent page structure.

**Props**:
- `children` (ReactNode): Page content
- `showFooter` (boolean, default: `true`): Whether to show footer

**Usage**:
```javascript
<PageLayout showFooter={false}>
  <div>Page content</div>
</PageLayout>
```

### Header

**File**: `components/Header.js`

Site header with logo and language switcher.

**Features**:
- Clickable logo (links to homepage)
- Language switcher (FR/EN buttons)
- Smooth fade-in animation
- Responsive design

**Dependencies**:
- `LanguageContext` for language state
- `IMAGE_PATHS.logo` for logo image

### Footer

**File**: `components/Footer.js`

Site footer with legal links.

**Features**:
- Legal notice link
- Privacy policy link
- Animated appearance
- Responsive design

**Note**: Links are currently placeholders (prevent default).

### LanguageNotification

**File**: `components/LanguageNotification.js`

Toast notification shown when language is changed.

**Features**:
- Auto-dismisses after a few seconds
- Shows current language
- Smooth animation

---

## 🔌 API Endpoints

### POST `/api/send-email`

Handles waitlist form submissions.

#### Request

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "fullName": "string (required)",
  "phoneNumber": "string (required)",
  "emailAddress": "string (required, valid email)",
  "postalCode": "string (required)",
  "language": "string (optional, 'fr' or 'en', default: 'fr')"
}
```

#### Response

**Success (200)**:
```json
{
  "message": "Emails sent successfully"
}
```

**Error (405)**:
```json
{
  "message": "Method not allowed"
}
```

**Error (500)**:
```json
{
  "message": "Server configuration error" | "Error sending emails"
}
```

#### Email Templates

The API sends two emails:

1. **User Confirmation Email**:
   - Sent to the email address provided in the form
   - Personalized greeting
   - Welcome message
   - Information about next steps

2. **Admin Notification Email**:
   - Sent to `ADMIN_EMAIL`
   - Contains all form data
   - Includes language preference
   - Formatted as HTML table

Both emails are sent in the user's selected language (French or English).

---

## 🌍 Internationalization (i18n)

### Translation System

All text content is centralized in `lib/translations.js`.

### Structure

Translations are organized by language and section:

```javascript
{
  fr: {
    common: { ... },      // Shared translations
    home: { ... },        // Homepage translations
    waitlist: { ... },    // Waitlist page translations
    thankYou: { ... },    // Thank you page translations
    language: { ... },    // Language notification translations
    email: { ... }        // Email template translations
  },
  en: { ... }            // Same structure for English
}
```

### Using Translations

In components:

```javascript
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'

function MyComponent() {
  const { language } = useLanguage()
  const t = useTranslations(language, 'home')
  
  return <h1>{t.title}</h1>
}
```

### Adding New Translations

1. Add the translation key to both `fr` and `en` objects in `lib/translations.js`
2. Use the translation in your component with `useTranslations()`

Example:
```javascript
// In lib/translations.js
home: {
  title: 'Pavillon 46',
  newKey: 'Nouvelle valeur',  // French
  // ...
}

// In component
const t = useTranslations(language, 'home')
<p>{t.newKey}</p>
```

### Language Context

The `LanguageContext` provides:

- `language`: Current language ('fr' or 'en')
- `changeLanguage(lang)`: Function to change language
- `languageChanged`: Boolean flag for notifications

Language preference is saved to `localStorage` and persists across sessions.

---

## 🎨 Styling & Animations

### CSS Architecture

All styles are in `styles/globals.css` using:

- **CSS Custom Properties**: For colors, spacing, fonts
- **Mobile-First**: Base styles for mobile, media queries for larger screens
- **BEM-like Naming**: Component-based class names

### Animation System

Animations use Framer Motion with predefined variants in `lib/constants.js`:

- `container`: Staggered children animations
- `item`: Standard fade-in with slide-up
- `itemSmall`: Smaller fade-in animation
- `logo`: Scale and fade animation
- `form`: Form container entrance
- `checkmark`: Success checkmark animation
- `page`: Page transition animations

### Using Animations

```javascript
import { motion } from 'framer-motion'
import { animationVariants } from '../lib/constants'

<motion.div
  variants={animationVariants.container}
  initial="hidden"
  animate="visible"
>
  <motion.div variants={animationVariants.item}>
    Content
  </motion.div>
</motion.div>
```

### Responsive Breakpoints

Defined in `styles/globals.css`:

- Mobile: Default (no media query)
- Tablet: `@media (min-width: 768px)`
- Desktop: `@media (min-width: 1024px)`
- Large Desktop: `@media (min-width: 1440px)`

---

## 🚢 Deployment

### Azure Static Web Apps

The project is configured for Azure Static Web Apps deployment.

#### Prerequisites

- Azure account
- GitHub repository
- Azure CLI (optional, for manual deployment)

#### Automated Deployment (GitHub Actions)

1. **Set up GitHub Secret**:
   - Go to GitHub repository → Settings → Secrets → Actions
   - Add secret: `AZURE_STATIC_WEB_APPS_API_TOKEN`
   - Value: Get from Azure Portal → Static Web App → Manage deployment token
   - Add secret: `ACTIVITY_REPORT_KEY` — same value as Azure **Configuration** → **Application settings** → `ACTIVITY_REPORT_KEY` (required for the scheduled workflow `.github/workflows/activity-daily-report.yml` that emails the daily activity report; schedule **22:58 UTC**, about **23:58 Europe/Zurich** in winter)

2. **Deploy**:
   - Push to `main` or `master` branch
   - GitHub Actions workflow (`.github/workflows/azure-static-web-app.yml`) will:
     - Build the Next.js app
     - Deploy to Azure Static Web App
     - Make it live automatically

#### Manual Deployment

See `azure/README.md` for detailed instructions on:
- Creating Azure resources with Bicep
- Getting deployment tokens
- Manual deployment steps

### Environment Variables in Production

Set environment variables in Azure Portal:

1. Go to **Static Web App** → **Configuration** → **Application settings**
2. Add each environment variable:
   - `SENDGRID_API_KEY`
   - `ADMIN_EMAIL`
   - `FROM_EMAIL`
   - `ACTIVITY_REPORT_KEY`
   - `ACTIVITY_DAILY_REPORT_TO`
3. Save and restart the app

### Custom Domain

The site uses a custom domain: **https://pavillon46.ch**

To set up:
1. In Azure Portal → Static Web App → **Custom domains**
2. Add your domain
3. Follow DNS configuration instructions

### Vercel Deployment (Alternative)

For Vercel deployment:

1. Connect GitHub repository to [Vercel](https://vercel.com)
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push

---

## 🔧 Troubleshooting

### Common Issues

#### 1. "SENDGRID_API_KEY is not defined"

**Solution**: 
- Check that `.env.local` exists in the project root
- Verify the variable name is exactly `SENDGRID_API_KEY`
- Restart the development server after adding env variables

#### 2. Emails not sending

**Possible causes**:
- Invalid SendGrid API key
- Sender email not verified in SendGrid
- SendGrid account limits reached
- Network/firewall issues

**Solution**:
- Verify API key in SendGrid dashboard
- Check SendGrid activity logs
- Ensure `FROM_EMAIL` is verified in SendGrid

#### 3. Language not persisting

**Solution**:
- Check browser localStorage (DevTools → Application → Local Storage)
- Clear localStorage and try again
- Ensure `LanguageContext` is properly wrapped in `_app.js`

#### 4. Images not loading

**Solution**:
- Verify image paths in `lib/constants.js` match files in `public/images/`
- Check that image files exist in `public/images/`
- Ensure Next.js Image component is used correctly

#### 5. Build errors

**Solution**:
- Run `npm install` to ensure all dependencies are installed
- Clear `.next` folder: `rm -rf .next` (or `rmdir /s .next` on Windows)
- Run `npm run build` again

#### 6. Deployment fails with "deployment_token was not provided"

**Solution**:
- Get deployment token from Azure Portal
- Add it as `AZURE_STATIC_WEB_APPS_API_TOKEN` in GitHub Secrets
- Re-run the workflow

### Debug Mode

Enable verbose logging:

```javascript
// In pages/api/send-email.js
console.log('Environment check:', {
  hasApiKey: !!process.env.SENDGRID_API_KEY,
  adminEmail: process.env.ADMIN_EMAIL,
  fromEmail: process.env.FROM_EMAIL
})
```

### Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support (iOS 12+)
- **Internet Explorer**: Not supported

---

## 🤝 Contributing

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Test thoroughly
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Code Guidelines

- Follow existing code style
- Add translations for all new text
- Test on multiple browsers
- Ensure responsive design works
- Update this README if adding features

### Translation Contributions

To add a new language:

1. Add language code to `SUPPORTED_LANGUAGES` in `lib/constants.js`
2. Add complete translation object in `lib/translations.js`
3. Update language switcher in `Header.js`
4. Test all pages in the new language

---

## 📝 License

This project is private and proprietary. All rights reserved.

---

## 📞 Support

For issues, questions, or contributions:

- **Repository**: [GitHub Issues](https://github.com/kiarashjam/pavillon-46/issues)
- **Email**: Contact the development team

---

## 🗺 Roadmap

Future enhancements:

- [ ] User authentication system
- [ ] Member dashboard
- [ ] Admin panel for waitlist management
- [ ] Additional languages
- [ ] Blog/news section
- [ ] Event calendar
- [ ] Member directory (private)

---

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Framer Motion Documentation](https://www.framer.com/motion/)
- [SendGrid API Documentation](https://docs.sendgrid.com)
- [Azure Static Web Apps Documentation](https://docs.microsoft.com/azure/static-web-apps/)

---

**Last Updated**: January 2026  
**Version**: 0.1.0  
**Maintained by**: Pavillon 46 Development Team
