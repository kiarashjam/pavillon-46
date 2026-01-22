import '../styles/globals.css'
import { Cormorant_Garamond, Great_Vibes, DM_Sans } from 'next/font/google'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-cormorant',
  display: 'swap',
})

const greatVibes = Great_Vibes({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-script',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})

export default function App({ Component, pageProps }) {
  return (
    <div className={`${cormorant.variable} ${greatVibes.variable} ${dmSans.variable}`}>
      <Component {...pageProps} />
    </div>
  )
}
