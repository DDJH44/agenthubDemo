export const designTokens = {
  colors: {
    primary: {
      main: 'var(--accent)',
      hover: 'var(--accent-hover)',
      light: 'var(--accent-light)',
      subtle: 'var(--accent-subtle)',
      border: 'var(--accent-border)',
    },
    neutral: {
      primary: 'var(--fg-primary)',
      secondary: 'var(--fg-secondary)',
      tertiary: 'var(--fg-tertiary)',
      disabled: 'var(--fg-disabled)',
    },
    background: {
      page: 'var(--page-bg)',
      surface: 'var(--surface-white)',
      tinted: 'var(--surface-tinted)',
      low: 'var(--surface-low)',
      mid: 'var(--surface-mid)',
      high: 'var(--surface-high)',
    },
    status: {
      success: 'var(--success)',
      successSubtle: 'var(--success-subtle)',
      warning: 'var(--warning)',
      warningSubtle: 'var(--warning-subtle)',
      danger: 'var(--danger)',
      dangerSubtle: 'var(--danger-subtle)',
    },
    border: {
      default: 'var(--border)',
      strong: 'var(--border-strong)',
      divider: 'var(--divider)',
    },
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '32px',
    '4xl': '40px',
  },
  borderRadius: {
    xs: 'var(--radius-xs)',
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    xl: 'var(--radius-xl)',
  },
  shadows: {
    xs: 'var(--shadow-xs)',
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)',
    lg: 'var(--shadow-lg)',
    xl: 'var(--shadow-xl)',
    glow: 'var(--shadow-glow)',
  },
  typography: {
    fontFamily: {
      sans: 'var(--font-sans)',
      mono: 'var(--font-mono)',
      heading: 'var(--font-heading)',
    },
    fontSize: {
      '2xs': 'var(--text-2xs)',
      xs: 'var(--text-xs)',
      sm: 'var(--text-sm)',
      base: 'var(--text-base)',
      md: 'var(--text-md)',
      lg: 'var(--text-lg)',
      xl: 'var(--text-xl)',
      '2xl': 'var(--text-2xl)',
    },
  },
  animation: {
    duration: {
      fast: 'var(--duration-fast)',
      normal: 'var(--duration-normal)',
      slow: 'var(--duration-slow)',
    },
    easing: {
      out: 'var(--ease-out)',
      spring: 'var(--ease-spring)',
      smooth: 'var(--ease-smooth)',
    },
  },
} as const;

export type DesignTokens = typeof designTokens;