import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  const siteUrl = 'https://pavillon46.ch'
  const siteTitle = 'Pavillon 46'
  const siteDescription = 'Bienvenue à Pavillon 46 - La vie en couleurs'

  return (
    <Html lang="fr">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="theme-color" content="#F8F7F2" />
        
        {/* Favicons */}
        <link rel="icon" type="image/png" sizes="32x32" href="/images/logo.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/images/logo.png" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/images/logo.png" />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={siteUrl} />
        <meta property="og:title" content={siteTitle} />
        <meta property="og:description" content={siteDescription} />
        <meta property="og:image" content={`${siteUrl}/images/logo.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Pavillon 46 Logo" />
        <meta property="og:locale" content="fr_CH" />
        <meta property="og:site_name" content="Pavillon 46" />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={siteUrl} />
        <meta name="twitter:title" content={siteTitle} />
        <meta name="twitter:description" content={siteDescription} />
        <meta name="twitter:image" content={`${siteUrl}/images/logo.png`} />
        <meta name="twitter:image:alt" content="Pavillon 46 Logo" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
