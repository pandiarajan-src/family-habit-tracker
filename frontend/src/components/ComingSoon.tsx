import { copy } from '../copy'
import { Notice } from './Notice'

/** Placeholder body for a screen a later phase builds; the route already exists. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <main className="page">
      <h1 className="page-title">{title}</h1>
      <Notice icon="sparkle" title={copy.comingSoon.title}>
        {copy.comingSoon.text}
      </Notice>
    </main>
  )
}
