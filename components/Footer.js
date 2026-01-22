export default function Footer() {
  return (
    <footer className="page-footer">
      <a href="#" className="footer-link" onClick={(e) => e.preventDefault()}>Legal</a>
      <span className="footer-separator">•</span>
      <a href="#" className="footer-link" onClick={(e) => e.preventDefault()}>Privacy Notice</a>
    </footer>
  )
}
