import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Image from 'next/image'
import PageLayout from '../components/layouts/PageLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { IMAGE_PATHS } from '../lib/constants'
import { motion } from 'framer-motion'

export default function Login() {
  const router = useRouter()
  const { language } = useLanguage()
  const t = useTranslations(language, 'login')

  const [formData, setFormData] = useState({
    account: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    document.body.classList.add('no-scroll')
    document.documentElement.classList.add('no-scroll')

    return () => {
      document.body.classList.remove('no-scroll')
      document.documentElement.classList.remove('no-scroll')
    }
  }, [])

  const formVariants = {
    enter: { opacity: 0, x: 70, scale: 0.95 },
    center: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: {
        duration: 0.7,
        ease: [0.16, 1, 0.3, 1],
        staggerChildren: 0.12,
        delayChildren: 0.1,
      },
    },
    exit: {
      opacity: 0,
      x: -40,
      scale: 0.98,
      transition: {
        duration: 0.25,
        ease: [0.4, 0, 1, 1],
      },
    },
  }

  const fieldVariants = {
    enter: { opacity: 0, y: 28, scale: 0.96 },
    center: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 200,
        damping: 20,
        mass: 0.9,
      },
    },
    exit: { opacity: 0, transition: { duration: 0.12 } },
  }

  const buttonVariants = {
    enter: { opacity: 0, y: 24, scale: 0.9 },
    center: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 180,
        damping: 16,
        mass: 1,
        delay: 0.06,
      },
    },
    exit: { opacity: 0, transition: { duration: 0.12 } },
  }

  const linkVariants = {
    enter: { opacity: 0, y: 12 },
    center: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.75,
        ease: [0.16, 1, 0.3, 1],
        delay: 0.15,
      },
    },
    exit: { opacity: 0, transition: { duration: 0.12 } },
  }

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
    setStatus('idle')
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.account.trim() || !formData.password.trim()) {
      setStatus('idle')
      setError(t.validationError)
      return
    }

    setStatus('loading')
    await new Promise((resolve) => setTimeout(resolve, 900))
    setStatus('success')
  }

  return (
    <>
      <Head>
        <title>{t.title}</title>
        <meta name="description" content={t.description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <PageLayout>
        <div className="waitlist-page login-page">
          <div className="background-container">
            <div className="background-image"></div>
          </div>

          <div className="form-overlay">
            <motion.div
              className="form-container login-form-container"
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div
                className="login-brand"
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.65, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                <Image
                  src={IMAGE_PATHS.logo}
                  alt={t.logoAlt}
                  width={320}
                  height={130}
                  className="login-brand-image"
                  priority
                />
              </motion.div>

              <motion.h1
                className="form-heading login-heading"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                {t.heading}
              </motion.h1>

              <motion.p
                className="step-description login-subtitle"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                {t.subtitle}
              </motion.p>

              <motion.form
                className="waitlist-form login-form"
                onSubmit={handleSubmit}
                variants={formVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <motion.div className="form-group login-field" variants={fieldVariants}>
                  <input
                    type="text"
                    id="account"
                    name="account"
                    placeholder={t.accountPlaceholder}
                    className="form-input login-input"
                    value={formData.account}
                    onChange={handleChange}
                    required
                    autoComplete="username"
                  />
                </motion.div>

                <motion.div className="form-group login-field login-password-field" variants={fieldVariants}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    name="password"
                    placeholder={t.passwordPlaceholder}
                    className="form-input login-input password-input"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? t.hidePassword : t.showPassword}
                  >
                    {showPassword ? t.hidePassword : t.showPassword}
                  </button>
                </motion.div>

                {error && (
                  <motion.p
                    className="verification-error login-error"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {error}
                  </motion.p>
                )}

                {status === 'success' && !error && (
                  <motion.p
                    className="login-success"
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {t.successMessage}
                  </motion.p>
                )}

                <motion.button
                  type="submit"
                  className="submit-button login-submit-button"
                  variants={buttonVariants}
                  disabled={status === 'loading'}
                  whileHover={{ scale: 1.03, y: -2, boxShadow: '0 10px 28px rgba(43, 85, 65, 0.3)' }}
                  whileTap={{ scale: 0.97, y: 0 }}
                >
                  {status === 'loading' ? t.loading : t.submitButton}
                </motion.button>

                <motion.div className="form-links login-form-links" variants={linkVariants}>
                  <motion.a
                    href="/waitlist"
                    className="form-link"
                    onClick={(e) => {
                      e.preventDefault()
                      router.push('/waitlist')
                    }}
                    whileHover={{ y: -1, opacity: 0.82 }}
                  >
                    {t.joinWaitlistLink}
                  </motion.a>
                </motion.div>
              </motion.form>
            </motion.div>
          </div>
        </div>
      </PageLayout>
    </>
  )
}
