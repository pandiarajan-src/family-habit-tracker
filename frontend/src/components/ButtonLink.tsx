import type { ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import styles from './Button.module.css'
import { Icon, type IconName } from './Icon'

interface ButtonLinkProps extends LinkProps {
  variant?: 'primary' | 'secondary' | 'quiet'
  size?: 'sm' | 'md' | 'lg'
  icon?: IconName
  children: ReactNode
}

/** A link that looks like Button: for moving to another screen ("Add a habit", "Edit"). */
export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  const classes = [styles.button, styles[variant], styles[size], className]
  return (
    <Link className={classes.filter(Boolean).join(' ')} {...rest}>
      {icon && <Icon name={icon} size={20} />}
      <span>{children}</span>
    </Link>
  )
}
