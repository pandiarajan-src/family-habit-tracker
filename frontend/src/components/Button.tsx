import type { ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'
import { Icon, type IconName } from './Icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'quiet'
  size?: 'sm' | 'md' | 'lg'
  icon?: IconName
  block?: boolean
}

/** The design system's button: at least 44px tall [family-ux #2], icon always beside a label. */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  block = false,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], block && styles.block, className]
  return (
    <button type={type} className={classes.filter(Boolean).join(' ')} {...rest}>
      {icon && <Icon name={icon} size={20} />}
      <span>{children}</span>
    </button>
  )
}
