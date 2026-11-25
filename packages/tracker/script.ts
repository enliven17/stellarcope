// Entry for the hosted script tag:
// <script defer src="https://<host>/t/<version>/a.js" data-site="..."></script>
import { init, track } from './tracker.ts'

const el = document.currentScript as HTMLScriptElement | null
const site = el?.dataset.site
if (el && site) {
  const endpoint = el.dataset.endpoint ?? new URL('/e', el.src).href
  init({ site, endpoint, respectDnt: el.dataset.dnt !== 'false' })
  ;(window as unknown as { stellarcope: { track: typeof track } }).stellarcope = { track }
}
