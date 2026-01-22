import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="theme-color" content="#F8F7F2" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
