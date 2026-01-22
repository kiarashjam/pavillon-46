# Image Assets Guide

## Where to Place Your Images

All images should be placed in the `public/images/` directory.

## Required Images

### 1. Homepage Left Section Image
**File:** `homepage-left-image.jpg` (or .png, .webp)

- **Location:** `public/images/homepage-left-image.jpg`
- **Usage:** Left section of the homepage with fragmented cutout effect
- **Recommended Size:** 800x1200px or larger
- **Format:** JPG, PNG, or WebP
- **Description:** This image will be visible through the fragmented "46" shape cutouts

### 2. Aerial Background Image
**File:** `aerial-background.jpg` (or .png, .webp)

- **Location:** `public/images/aerial-background.jpg`
- **Usage:** Full-screen background for waitlist and thank-you pages
- **Recommended Size:** 1920x1080px or larger (full HD)
- **Format:** JPG, PNG, or WebP
- **Description:** Aerial view of the resort complex with tennis courts, pool, and buildings

## How Images Are Referenced

In Next.js, files in the `public/` folder are served from the root URL:
- `public/images/homepage-left-image.jpg` → `/images/homepage-left-image.jpg`
- `public/images/aerial-background.jpg` → `/images/aerial-background.jpg`

## Adding Your Images

1. **Copy your images** to the `public/images/` directory
2. **Name them exactly** as specified above:
   - `homepage-left-image.jpg`
   - `aerial-background.jpg`
3. **Supported formats:** `.jpg`, `.jpeg`, `.png`, `.webp`

## Image Optimization Tips

- Use WebP format for better compression
- Optimize images before adding (use tools like TinyPNG, ImageOptim)
- Recommended max file size: 500KB per image
- For best quality, use images at least 2x the display size (retina displays)

## Fallback

If images are not found, the pages will show gradient backgrounds as placeholders.
