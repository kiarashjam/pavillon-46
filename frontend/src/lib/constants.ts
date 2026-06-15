import type { Variants } from 'framer-motion'
import { EASE_OUT, EASE_BOUNCE } from './motion'

export const APP_NAME = 'Pavillon 46'
export const DEFAULT_LANGUAGE: 'fr' | 'en' = 'fr'

export const IMAGE_PATHS = {
  logo: '/images/logo.png',
  checkmark: '/images/Frame%201000004712.svg',
}

export const animationVariants: Record<string, Variants> = {
  container: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.2 },
    },
  },
  item: {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: EASE_OUT },
    },
  },
  itemSmall: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.5, ease: EASE_OUT },
    },
  },
  form: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.6, ease: EASE_OUT },
    },
  },
  checkmark: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.8, ease: EASE_BOUNCE },
    },
  },
}
