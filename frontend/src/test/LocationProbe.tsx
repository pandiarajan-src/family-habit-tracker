import { useLocation } from 'react-router'

/** Shows the router's current path so tests can assert navigation by its label. */
export function LocationProbe() {
  const { pathname } = useLocation()
  return <output aria-label="Current path">{pathname}</output>
}
