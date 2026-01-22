# Image Usage Guide

## Images Currently Used

### Homepage (index.js)
- **Image:** `image 19.png`
- **Location:** Left section with fragmented "46" cutout effect
- **CSS Class:** `.image-placeholder` and `.image-fragment`

### Waitlist & Thank You Pages
- **Image:** `image 18.png`
- **Location:** Full-screen background
- **CSS Class:** `.background-image`

## Available Images

You have these images in the `public/images/` folder:
- `image 18.png` ✅ (Used for aerial background)
- `image 19.png` ✅ (Used for homepage left section)
- `image 19-1.png`
- `image 19-2.png`
- `image 19-3.png`
- `image 20.png`
- `image 4.png`
- `image 6.png`
- `Frame 1000004712.svg`
- `svg.png`
- `Vector.png`

## To Change Images

### Change Homepage Image:
Edit `styles/globals.css`:
```css
.image-placeholder {
    background-image: url('/images/YOUR_IMAGE_NAME.png');
}
.image-fragment {
    background-image: url('/images/YOUR_IMAGE_NAME.png');
}
```

### Change Background Image:
Edit `styles/globals.css`:
```css
.background-image {
    background-image: url('/images/YOUR_IMAGE_NAME.png');
}
```

## Image Requirements

- **Homepage left image:** Should show hands/glasses/beverages for the fragmented effect
- **Aerial background:** Should show the resort complex from above (tennis courts, pool, buildings)
