// Entry for the hosted script tag:
// <script async src="https://<host>/t/<version>/a.js" data-site="..."></script>
import { init, track } from './tracker.ts'

const el = document.currentScript as HTMLScriptElement | null
const site = el?.dataset.site
if (el && site)
  try {
    const endpoint = el.dataset.endpoint ?? new URL('/e', el.src).href
    const installed = init({
      site,
      endpoint,
      respectDnt: el.dataset.dnt !== 'false',
      excludePaths: el.dataset.excludePaths
        ?.split(',')
        .map((path) => path.trim())
        .filter(Boolean),
    })
    if (installed && !('stellarcope' in window))
      (window as unknown as { stellarcope: { track: typeof track } }).stellarcope = { track }
  } catch {
    /* invalid configuration or a locked host global must not break the page */
  }
