# Responsive Design Guide

## Breakpoints

The website is fully responsive with the following breakpoints:

### 📱 Small Mobile (320px - 479px)
- **Homepage**: Stacked layout, image section 40vh, content section 60vh
- **Typography**: Reduced font sizes for readability
- **Forms**: Full-width inputs with larger touch targets (44px minimum)
- **Spacing**: Compact padding for small screens

### 📱 Mobile (480px - 767px)
- **Homepage**: Stacked layout, image section 40vh, content section 60vh
- **Logo**: 36px for PAVILLON, 42px for 46
- **Slogan**: 20px font size
- **Forms**: Optimized padding and spacing
- **Navigation**: Compact header with smaller text

### 📱 Tablet (768px - 1023px)
- **Homepage**: Stacked layout, image section 50vh, content section 50vh
- **Logo**: 48px for PAVILLON, 56px for 46
- **Slogan**: 24px font size
- **Forms**: Medium-sized containers (600px max-width)
- **Layout**: Better use of horizontal space

### 💻 Medium Desktop (1024px - 1439px)
- **Homepage**: Split-screen layout (42.5% / 57.5%)
- **Logo**: 56px for PAVILLON, 64px for 46
- **Slogan**: 28px font size
- **Forms**: Standard containers
- **Layout**: Full split-screen experience

### 🖥️ Large Desktop (1440px+)
- **Homepage**: Full split-screen layout
- **Logo**: 64px for PAVILLON, 72px for 46
- **Slogan**: 32px font size
- **Forms**: Maximum container sizes
- **Layout**: Optimal viewing experience

## Key Features

### ✅ Mobile Optimizations
- **Touch Targets**: All interactive elements are minimum 44px height
- **Stacked Layout**: Homepage switches to vertical layout on mobile
- **Hidden Elements**: Fragmented image effects hidden on small screens for performance
- **Readable Text**: Font sizes optimized for mobile reading
- **No Horizontal Scroll**: All content fits within viewport

### ✅ Tablet Optimizations
- **Balanced Layout**: Good mix of stacked and side-by-side elements
- **Medium Typography**: Comfortable reading sizes
- **Optimized Forms**: Forms sized appropriately for tablet screens

### ✅ Desktop Optimizations
- **Full Split-Screen**: Homepage uses full split-screen layout
- **Large Typography**: Maximum readability and impact
- **Spacious Layout**: Generous padding and spacing

### ✅ Special Features
- **Landscape Mobile**: Special handling for landscape orientation
- **Touch Devices**: Optimized for touch interactions
- **Smooth Scrolling**: Enabled for better UX
- **Overflow Prevention**: No horizontal scrolling on any device

## Responsive Elements

### Homepage
- **Left Section**: Image with fragmented cutouts (hidden on mobile)
- **Right Section**: Content area that stacks on mobile/tablet
- **Logo**: Scales from 32px to 64px based on screen size
- **Button**: Full-width on mobile, fixed width on desktop

### Waitlist/Thank You Pages
- **Background**: Full-screen image that scales properly
- **Form Overlay**: Responsive padding and max-widths
- **Header/Footer**: Compact on mobile, spacious on desktop
- **Form Inputs**: Touch-optimized on mobile devices

## Testing Recommendations

Test on:
- ✅ iPhone SE (320px)
- ✅ iPhone 12/13 (390px)
- ✅ iPad (768px)
- ✅ iPad Pro (1024px)
- ✅ Desktop (1440px+)
- ✅ Landscape orientations

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

All responsive styles use standard CSS media queries for maximum compatibility.
