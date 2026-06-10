// Shared cubic-bezier easing tuples for framer-motion. Keeping them as explicit
// 4-tuples avoids `number[]` inference, which framer-motion v12 rejects.

export type CubicBezier = [number, number, number, number]

export const EASE_OUT: CubicBezier = [0.25, 0.46, 0.45, 0.94]
export const EASE_SOFT: CubicBezier = [0.22, 1, 0.36, 1]
export const EASE_BOUNCE: CubicBezier = [0.34, 1.56, 0.64, 1]
export const EASE_QUICK_OUT: CubicBezier = [0.4, 0, 1, 1]
export const EASE_SMOOTH_OUT: CubicBezier = [0.16, 1, 0.3, 1]
