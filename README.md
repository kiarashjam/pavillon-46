# Pavillon 46 - Next.js Website

A modern, elegant website for Pavillon 46 built with Next.js.

## Getting Started

First, install the dependencies:

```bash
npm install
# or
yarn install
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

```
├── pages/
│   ├── _app.js          # App wrapper with global styles
│   ├── _document.js     # Custom document structure
│   ├── index.js         # Homepage
│   ├── waitlist.js      # Waitlist form page
│   └── thank-you.js     # Thank you confirmation page
├── components/
│   ├── Header.js        # Shared header component
│   └── Footer.js        # Shared footer component
├── styles/
│   └── globals.css      # Global styles
├── package.json
└── next.config.js
```

## Pages

- **Homepage** (`/`) - Split-screen landing page with logo and call-to-action
- **Waitlist** (`/waitlist`) - Form to join the waitlist
- **Thank You** (`/thank-you`) - Confirmation page after form submission

## Features

- ✅ Next.js 14 with React 18
- ✅ Optimized Google Fonts (Jost, Playfair Display, Dancing Script)
- ✅ Responsive design
- ✅ Client-side routing
- ✅ Form handling with React hooks
- ✅ Shared components (Header, Footer)

## Building for Production

```bash
npm run build
npm start
```

## Deployment

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new).

## Adding Images

1. **Homepage Image**: Add `homepage-left-image.jpg` to `public/images/`
   - This image appears in the left section with fragmented cutout effects
   - Recommended size: 800x1200px or larger

2. **Background Image**: Add `aerial-background.jpg` to `public/images/`
   - This is used as the full-screen background on waitlist and thank-you pages
   - Recommended size: 1920x1080px or larger

See `public/images/ASSETS_README.md` for detailed instructions.

## Notes

- Images should be placed in `public/images/` directory
- Supported formats: .jpg, .jpeg, .png, .webp
- Add your backend API endpoint in `pages/waitlist.js` for form submission
- Customize colors, fonts, and content as needed
