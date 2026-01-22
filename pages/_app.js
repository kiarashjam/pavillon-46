import '../styles/globals.css'
import { Jost, Playfair_Display, Dancing_Script } from 'next/font/google'

const jost = Jost({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jost',
  display: 'swap',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-playfair',
  display: 'swap',
})

const dancingScript = Dancing_Script({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dancing',
  display: 'swap',
})

export default function App({ Component, pageProps }) {
  return (
    <div className={`${jost.variable} ${playfair.variable} ${dancingScript.variable}`}>
      <Component {...pageProps} />
    </div>
  )
}
