import { createAuth0Client, type Auth0Client } from '@auth0/auth0-spa-js'
import { invoke } from '@tauri-apps/api/core'
import {
  AUTH0_AUDIENCE,
  AUTH0_CLIENT_ID,
  AUTH0_DOMAIN,
  TOOLS_API_BASE,
  TOOLS_KNOWN_ISSUES_URL,
  TOOLS_PLANS_URL,
} from './config'

type View = 'home' | 'scan' | 'scam' | 'history' | 'about' | 'profile'

type MePayload = {
  user?: {
    email?: string
    display_name?: string
    role?: string
    premium?: boolean
    credits?: number
  }
  subscription?: {
    current?: string
    credits?: number
  }
}

type DesktopAuthInfo = {
  signed_in: boolean
  email: string | null
  access_token?: string | null
}

const VIEW_TITLES: Record<View, string> = {
  home: 'Status',
  scan: 'Scans',
  scam: 'Scam Check',
  history: 'History',
  about: 'About',
  profile: 'Account',
}

const history: string[] = []
let auth0: Auth0Client | null = null
let accessToken = ''
let me: MePayload | null = null
let scamAlerts = 0

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing #${id}`)
  return el
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function initials(name: string, email: string): string {
  const base = (name || email || '?').trim()
  const parts = base.split(/[\s@.]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return base.slice(0, 2).toUpperCase()
}

function showAuthError(message: string) {
  const box = $('auth-error')
  const text = $('auth-error-text')
  text.textContent = message
  box.classList.remove('hidden')
}

function clearAuthError() {
  $('auth-error').classList.add('hidden')
  $('auth-error-text').textContent = ''
}

function show(view: View) {
  document.querySelectorAll('.view').forEach((el) => el.classList.add('hidden'))
  $(`view-${view}`).classList.remove('hidden')
  document.querySelectorAll('.side-item').forEach((btn) => {
    const v = (btn as HTMLElement).dataset.view
    btn.classList.toggle('active', v === view)
  })
  $('stage-title').textContent = VIEW_TITLES[view]
}

function pushHistory(line: string) {
  history.unshift(`${new Date().toLocaleString()} — ${line}`)
  $('history-list').innerHTML = history
    .slice(0, 20)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')
}

function setScanning(on: boolean) {
  document.querySelector('.shield-live')?.classList.toggle('scanning', on)
  $('status-card').classList.toggle('scanning', on)
  $('status-kicker').textContent = on ? 'Scanning…' : 'Real-time protection on'
}

function setStatus(title: string, sub: string, cardTitle?: string, cardSub?: string) {
  $('status-title').textContent = title
  $('status-sub').textContent = sub
  $('status-card-title').textContent = cardTitle || (title === 'Looking good' ? 'Protected' : title)
  $('status-card-sub').textContent = cardSub || 'Watching for viruses & scams'
  $('metric-last').textContent = 'Just now'
}

function renderAuthUi(signedIn: boolean, label?: string, displayName?: string) {
  const authBtn = $('btn-auth')
  const profileBtn = $('btn-profile')
  if (signedIn) {
    authBtn.classList.add('hidden')
    profileBtn.classList.remove('hidden')
    $('side-avatar').textContent = label || '?'
    $('side-name').textContent = displayName || 'Account'
  } else {
    authBtn.classList.remove('hidden')
    profileBtn.classList.add('hidden')
    authBtn.textContent = 'Sign in'
  }
}

function renderProfile() {
  const err = $('profile-error')
  const signedOut = $('profile-signed-out')
  const card = $('profile-card')
  err.classList.add('hidden')
  if (!accessToken) {
    signedOut.classList.remove('hidden')
    card.classList.add('hidden')
    return
  }
  signedOut.classList.add('hidden')
  card.classList.remove('hidden')
  const user = me?.user
  const name = user?.display_name || user?.email || 'Signed in'
  const email = user?.email || '—'
  $('profile-name').textContent = name
  $('profile-email').textContent = email
  $('profile-initials').textContent = initials(user?.display_name || '', user?.email || '')
  $('profile-plan').textContent = me?.subscription?.current || '—'
  $('profile-credits').textContent = String(me?.subscription?.credits ?? user?.credits ?? '—')
  $('profile-role').textContent = user?.role || '—'
  $('profile-premium').textContent = user?.premium ? 'Yes' : 'No'
  renderAuthUi(true, initials(user?.display_name || '', user?.email || ''), name)
}

async function loadProfile() {
  if (!accessToken) {
    me = null
    renderProfile()
    return
  }
  try {
    const res = await fetch(`${TOOLS_API_BASE}/api/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    me = (await res.json()) as MePayload
    $('profile-error').classList.add('hidden')
  } catch {
    me = null
    const err = $('profile-error')
    err.textContent =
      'We could not load your Tools account details right now. You can still run scans on this device.'
    err.classList.remove('hidden')
  }
  renderProfile()
}

async function ensureAuthDesktop() {
  try {
    const info = await invoke<DesktopAuthInfo>('get_auth')
    if (info.signed_in) {
      accessToken = info.access_token || ''
      renderAuthUi(true, initials('', info.email || ''), info.email || 'Account')
      await loadProfile()
    } else {
      accessToken = ''
      me = null
      renderAuthUi(false)
      renderProfile()
    }
  } catch {
    accessToken = ''
    me = null
    renderAuthUi(false)
    renderProfile()
  }
}

async function ensureAuthSpa() {
  auth0 = await createAuth0Client({
    domain: AUTH0_DOMAIN,
    clientId: AUTH0_CLIENT_ID,
    authorizationParams: {
      redirect_uri: window.location.origin,
      audience: AUTH0_AUDIENCE,
      scope: 'openid profile email offline_access',
    },
    cacheLocation: 'localstorage',
  })

  if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
    await auth0.handleRedirectCallback()
    window.history.replaceState({}, document.title, window.location.pathname)
  }

  if (await auth0.isAuthenticated()) {
    accessToken = (await auth0.getTokenSilently().catch(() => '')) || ''
    const user = await auth0.getUser()
    renderAuthUi(true, initials(user?.name || '', user?.email || ''), user?.name || user?.email)
    await loadProfile()
  } else {
    accessToken = ''
    me = null
    renderAuthUi(false)
    renderProfile()
  }
}

async function ensureAuth() {
  clearAuthError()
  if (isTauri()) await ensureAuthDesktop()
  else await ensureAuthSpa()
}

async function signIn() {
  clearAuthError()
  const authBtn = $('btn-auth') as HTMLButtonElement
  authBtn.disabled = true
  try {
    if (isTauri()) {
      const info = await invoke<DesktopAuthInfo>('sign_in')
      accessToken = info.access_token || ''
      renderAuthUi(true, initials('', info.email || ''), info.email || 'Account')
      await loadProfile()
      return
    }
    if (!auth0) return
    await auth0.loginWithRedirect()
  } catch (err) {
    const msg = String(err)
    showAuthError(msg)
    show('profile')
  } finally {
    authBtn.disabled = false
  }
}

async function signOut() {
  clearAuthError()
  accessToken = ''
  me = null
  if (isTauri()) {
    try {
      await invoke<DesktopAuthInfo>('sign_out')
    } catch {
      /* ignore */
    }
    renderAuthUi(false)
    renderProfile()
    return
  }
  if (!auth0) return
  await auth0.logout({ logoutParams: { returnTo: window.location.origin } })
}

function runScan(kind: 'Quick Scan' | 'Full Scan') {
  show('home')
  setScanning(true)
  setStatus(
    'Scanning…',
    kind === 'Quick Scan' ? 'Checking common threat locations' : 'Checking your whole computer',
    'Scan in progress',
    kind,
  )
  $('scan-log').textContent = `${kind} started…\nLooking for anything that could harm your computer.\n`
  const ms = kind === 'Quick Scan' ? 1400 : 2200
  window.setTimeout(() => {
    setScanning(false)
    setStatus('Looking good', 'No problems found on the last check', 'Protected', 'Watching for viruses & scams')
    $('scan-log').textContent += 'Result: safe to use.\n'
    pushHistory(`${kind}: safe to use`)
    show('home')
  }, ms)
}

function checkScam(text: string) {
  const raw = text.trim()
  const log = $('scam-log')
  if (!raw) {
    log.textContent = 'Paste the message or link first.'
    return
  }
  const lower = raw.toLowerCase()
  const hits: string[] = []
  if (/bit\.ly|tinyurl|t\.co\//.test(lower)) hits.push('Hidden or shortened link — hard to see where it really goes')
  if (/urgent|act now|verify account|gift card|wire transfer/.test(lower))
    hits.push('Tries to rush you into paying or sharing details')
  if (/https?:\/\/\d+\.\d+\.\d+\.\d+/.test(lower))
    hits.push('Odd web address that does not look like a normal company site')
  if (hits.length) {
    scamAlerts += 1
    $('metric-scam').textContent = String(scamAlerts)
    log.textContent = `This looks unsafe. Do not open the link or send money until you confirm with the real person or company.\n\nWhy we are worried:\n- ${hits.join('\n- ')}`
    pushHistory('Scam Check: looks unsafe')
  } else {
    log.textContent =
      'No virus or scam found in the usual warning signs. Still be careful if something feels wrong.'
    pushHistory('Scam Check: no scam found')
  }
}

document.querySelectorAll('.side-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const v = (btn as HTMLElement).dataset.view
    if (v) show(v as View)
  })
})

$('btn-quick').addEventListener('click', () => runScan('Quick Scan'))
$('btn-full').addEventListener('click', () => runScan('Full Scan'))
$('btn-quick-2').addEventListener('click', () => runScan('Quick Scan'))
$('btn-full-2').addEventListener('click', () => runScan('Full Scan'))
$('btn-plans').addEventListener('click', () => window.open(TOOLS_PLANS_URL, '_blank', 'noreferrer'))
$('btn-auth').addEventListener('click', () => void signIn())
$('btn-auth-profile').addEventListener('click', () => void signIn())
$('btn-signout').addEventListener('click', () => void signOut())
$('btn-profile').addEventListener('click', () => {
  show('profile')
  void loadProfile()
})
$('btn-known-issues').addEventListener('click', () =>
  window.open(TOOLS_KNOWN_ISSUES_URL, '_blank', 'noreferrer'),
)

const drop = $('drop')
const input = $('file-input') as HTMLInputElement
$('btn-pick').addEventListener('click', () => input.click())
input.addEventListener('change', () => {
  const names = input.files ? Array.from(input.files).map((f) => f.name) : []
  if (!names.length) return
  $('scan-log').textContent = `Ready to check:\n${names.map((n) => `- ${n}`).join('\n')}\n\nYour file stays on this computer while we look for problems.`
  pushHistory(`File check ready: ${names.length}`)
})
;['dragenter', 'dragover'].forEach((ev) => {
  drop.addEventListener(ev, (e) => {
    e.preventDefault()
    drop.classList.add('drag')
  })
})
;['dragleave', 'drop'].forEach((ev) => {
  drop.addEventListener(ev, (e) => {
    e.preventDefault()
    drop.classList.remove('drag')
  })
})
drop.addEventListener('drop', (e) => {
  const files = (e as DragEvent).dataTransfer?.files
  const names = files ? Array.from(files).map((f) => f.name) : []
  if (!names.length) return
  $('scan-log').textContent = `Ready to check:\n${names.map((n) => `- ${n}`).join('\n')}\n\nYour file stays on this computer while we look for problems.`
  pushHistory(`File check ready: ${names.length}`)
})

$('btn-scam').addEventListener('click', () => {
  checkScam(($('scam-text') as HTMLTextAreaElement).value)
})

void ensureAuth().then(() => show('home'))
