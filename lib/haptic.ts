
/** Trigger device haptic feedback via Vibration API (mobile browsers). */
export const haptic = (style: 'light' | 'medium' | 'heavy' = 'light'): void => {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  const ms = { light: 10, medium: 25, heavy: 50 }[style];
  navigator.vibrate(ms);
};
