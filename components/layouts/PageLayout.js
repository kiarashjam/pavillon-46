import Header from '../Header'
import Footer from '../Footer'

/**
 * Reusable page layout component
 * Wraps pages with Header and Footer
 */
export default function PageLayout({ children, showFooter = true }) {
  return (
    <>
      <Header />
      {children}
      {showFooter && <Footer />}
    </>
  )
}
