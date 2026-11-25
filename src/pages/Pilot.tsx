import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Nav from '../components/Nav'
import { useApi } from '../lib/api'
import Dashboard from './Dashboard'

type Project = { id: string; name: string }

export default function Pilot() {
  const session = useApi<{ tenant: Project }>('/api/pilot', 15000)
  const [project, setProject] = useState<Project | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const tenant = blocked ? null : (project ?? session.data?.tenant)

  useEffect(() => {
    const denied = () => {
      setProject(null)
      setBlocked(true)
      setCode('')
      setError('Your project access changed or expired. Please sign in again.')
    }
    window.addEventListener('stellarcope:pilot-access-denied', denied)
    return () => window.removeEventListener('stellarcope:pilot-access-denied', denied)
  }, [])
  useEffect(() => {
    if (session.data && !blocked) setProject(session.data.tenant)
    if (session.status === 401 && project) {
      setProject(null)
      setBlocked(true)
      setError('Your project access changed or expired. Please sign in again.')
    }
  }, [session.data, session.status])

  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/pilot', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Could not sign in. Please try again.')
      setCode('')
      setProject(body.tenant)
      setBlocked(false)
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const signOut = async () => {
    try {
      const response = await fetch('/api/pilot', { method: 'DELETE', credentials: 'same-origin' })
      if (!response.ok) throw new Error('Sign out failed. Please try again.')
      window.location.replace('/pilot')
    } catch (failure) {
      window.alert((failure as Error).message)
    }
  }

  if (tenant)
    return (
      <Dashboard
        key={tenant.id}
        pilotTenant={tenant.id}
        onSignOut={() => {
          void signOut()
        }}
      />
    )

  return (
    <>
      <Nav />
      <main
        id="main"
        className="mx-auto grid min-h-screen max-w-[1440px] items-center gap-12 px-4 py-28 sm:px-8 lg:grid-cols-[1.3fr_1fr] lg:gap-24"
      >
        <div>
          <p className="label text-gold">Stellarcope / early access</p>
          <h1 className="mt-6 max-w-2xl text-[clamp(3rem,6vw,6rem)] leading-[1.02] tracking-tight">
            Your website.
            <br />
            <span className="text-mute">A clearer picture.</span>
          </h1>
          <p className="mt-8 max-w-md text-base leading-relaxed text-mute">
            See your traffic, where visitors come from, and the pages they use. One lightweight
            snippet. We help you get started.
          </p>
          <Link to="/docs/quickstart" className="mt-8 inline-block font-mono text-[12px] text-gold">
            How installation works →
          </Link>
        </div>
        <section className="hair border bg-panel p-6 sm:p-10" aria-labelledby="pilot-signin">
          <p className="label text-dim">Private project dashboard</p>
          <h2 id="pilot-signin" className="mt-4 text-2xl">
            Open your dashboard
          </h2>
          {session.loading ? (
            <p role="status" className="mt-6 text-sm text-mute">
              Checking your session…
            </p>
          ) : (
            <>
              <p className="mt-4 text-sm leading-relaxed text-mute">
                Enter the project access code we shared with your team. Need access or a replacement
                code? Contact the person who onboarded your project.
              </p>
              {session.error && session.status !== 401 && (
                <p role="alert" className="mt-5 text-sm text-gold">
                  The dashboard service could not be reached. You can retry signing in below.
                </p>
              )}
              <form
                className="mt-8"
                onSubmit={(event) => {
                  void signIn(event)
                }}
              >
                <label htmlFor="pilot-code" className="label">
                  Project access code
                </label>
                <input
                  id="pilot-code"
                  name="code"
                  type="password"
                  required
                  autoComplete="current-password"
                  maxLength={128}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className="hair mt-3 block w-full border bg-space px-4 py-3 font-mono text-sm outline-none focus:border-gold"
                  placeholder="scp_…"
                  aria-describedby="pilot-code-help"
                />
                <p
                  id="pilot-code-help"
                  className="mt-3 font-mono text-[11px] leading-relaxed text-dim"
                >
                  Keep this code within your team. It opens only your project’s reports.
                </p>
                {error && (
                  <p role="alert" className="mt-5 text-sm text-gold">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy || !code.trim()}
                  className="btn btn-solid mt-6 w-full justify-between disabled:opacity-50"
                >
                  {busy ? 'Opening…' : 'Open dashboard'} <span aria-hidden>→</span>
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </>
  )
}
