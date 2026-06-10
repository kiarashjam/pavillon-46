# Sogo Font Files

**IMPORTANT: Add your Sogo font files to THIS directory (`public/fonts/`)**

This directory should contain the Sogo font files in WOFF2 format. The CSS @font-face declarations reference fonts from `/fonts/` which maps to this `public/fonts/` directory.

## Required Font Files

Please add the following Sogo font files to this directory:

- `Sogo-Regular.woff2` (weight: 400)
- `Sogo-Medium.woff2` (weight: 500)
- `Sogo-SemiBold.woff2` (weight: 600)
- `Sogo-Bold.woff2` (weight: 700)

## Font Source

Sogo is a commercial font by Pavel Larin (Larin Type Co.). You can purchase it from:
- MyFonts: https://www.myfonts.com/collections/sogo-font-larin-type-co

## Alternative Formats

If you have the font in other formats (TTF, OTF, WOFF), you can convert them to WOFF2 using online tools or font conversion utilities.

## Note

The application is configured to use Sogo as the primary font via CSS @font-face. If the font files are not present, the system will fall back to Arial without breaking the build.
