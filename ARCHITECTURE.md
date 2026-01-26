# Pavillon 46 - Architecture Overview

## Directory Structure

```
pavillon-46/
├── pages/                    # Next.js pages (file-based routing)
│   ├── _app.js              # App wrapper with providers and global setup
│   ├── _document.js         # Custom HTML document structure
│   ├── index.js             # Homepage (/)
│   ├── waitlist.js          # Waitlist form page (/waitlist)
│   ├── thank-you.js         # Thank you page (/thank-you)
│   └── api/
│       └── send-email.js    # Email API endpoint
│
├── components/               # React components
│   ├── layouts/
│   │   └── PageLayout.js    # Reusable page layout (Header + Footer wrapper)
│   ├── Header.js            # Site header with logo and language switcher
│   ├── Footer.js            # Site footer with legal links
│   └── LanguageNotification.js  # Toast notification for language changes
│
├── contexts/                # React contexts
│   └── LanguageContext.js   # Language state management (FR/EN)
│
├── lib/                     # Shared utilities and constants
│   ├── translations.js      # Centralized translations (FR/EN)
│   └── constants.js         # App constants, animation variants, image paths
│
├── styles/                  # Global styles
│   └── globals.css          # Global CSS with all page styles
│
├── public/                  # Static assets
│   ├── images/              # Image assets
│   │   ├── logo.png
│   │   ├── image 4.png
│   │   ├── image 6.png
│   │   └── Frame 1000004712.svg
│   └── fonts/               # Font files (Sogo)
│
└── azure/                   # Azure deployment configuration
    ├── main.bicep
    └── static-web-app.bicep
```

## Key Architectural Decisions

### 1. Centralized Translations
- **Location**: `lib/translations.js`
- **Purpose**: Single source of truth for all text content
- **Benefits**: 
  - Easy to maintain and update translations
  - Consistent text across the application
  - Supports function-based translations for dynamic content (emails)

### 2. Shared Constants
- **Location**: `lib/constants.js`
- **Contains**:
  - Animation variants (reusable Framer Motion configurations)
  - Image paths (centralized asset references)
  - App-wide constants

### 3. Layout Component
- **Location**: `components/layouts/PageLayout.js`
- **Purpose**: Reduces code duplication across pages
- **Usage**: Wraps page content with Header and Footer

### 4. Component Organization
- **Layouts**: Reusable page structure components
- **UI Components**: Header, Footer, LanguageNotification
- **Clear separation**: Each component has a single responsibility

## Data Flow

### Language Management
```
LanguageContext (Provider)
    ↓
useLanguage() hook
    ↓
Components/Pages
    ↓
useTranslations(language, section)
    ↓
lib/translations.js
```

### Form Submission Flow
```
Waitlist Page
    ↓
Form Submit
    ↓
POST /api/send-email
    ↓
SendGrid API
    ↓
Admin Email + User Confirmation Email
```

## File Naming Conventions

- **Pages**: kebab-case (`waitlist.js`, `thank-you.js`)
- **Components**: PascalCase (`Header.js`, `PageLayout.js`)
- **Utilities**: camelCase (`translations.js`, `constants.js`)
- **Styles**: kebab-case (`globals.css`)

## Best Practices

1. **Imports**: Always use absolute imports from project root
2. **Translations**: Use `useTranslations()` hook, never hardcode text
3. **Images**: Reference via `IMAGE_PATHS` constant from `lib/constants.js`
4. **Animations**: Use variants from `animationVariants` in `lib/constants.js`
5. **Layout**: Use `PageLayout` component for all pages

## Adding New Features

### Adding a New Page
1. Create file in `pages/` directory
2. Use `PageLayout` component
3. Import translations: `useTranslations(language, 'sectionName')`
4. Add translations to `lib/translations.js`

### Adding a New Translation
1. Add to appropriate section in `lib/translations.js`
2. Use `useTranslations(language, 'sectionName')` in component
3. Access via `t.keyName`

### Adding a New Component
1. Create in `components/` directory
2. Use PascalCase naming
3. Import translations if needed
4. Use animation variants from constants

## Dependencies

- **Next.js 14**: React framework
- **React 18**: UI library
- **Framer Motion**: Animation library
- **SendGrid**: Email service
- **Google Fonts**: Jost, Great Vibes (via Next.js font optimization)
