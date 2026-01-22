# Images Directory

Place your images in this directory.

## Required Images

### Homepage
- **homepage-left-image.jpg** (or .png, .webp)
  - For the left section of the homepage
  - Recommended size: 800x1200px or larger
  - This will be used in the fragmented cutout effect

### Waitlist & Thank You Pages
- **aerial-background.jpg** (or .png, .webp)
  - Full-screen background image
  - Recommended size: 1920x1080px or larger
  - Aerial view of the resort complex

## Image Formats Supported
- .jpg / .jpeg
- .png
- .webp

## How to Use

1. Add your images to this `public/images/` directory
2. Update the CSS or component files to reference your images
3. For Next.js, images in `public/` can be referenced as `/images/filename.jpg`

## Example Usage

In CSS:
```css
background-image: url('/images/aerial-background.jpg');
```

In Next.js Image component:
```jsx
import Image from 'next/image'
<Image src="/images/homepage-left-image.jpg" alt="Description" />
```
