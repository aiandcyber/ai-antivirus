import { createAuth0Client, type Auth0Client } from '@auth0/auth0-spa-js'
import {
  AUTH0_AUDIENCE,
  AUTH0_CLIENT_ID,
  AUTH0_DOMAIN,
  TOOLS_API_BASE,
  TOOLS_PLANS_URL,
  TOOLS_PROFILE_URL,
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

const history: string[] = []
let auth0: Auth0Client | null = null
let accessToken = ''
let me: MePayload | null = null

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

function show(view: View) {
  document.querySelectorAll('.view').forEach((el) => el.classList.add('hidden'))
  $(`view-${view}`).classList.remove('hidden')
  document.querySelectorAll('.nav-chip').forEach((btn) => {
    const v = (btn as HTMLElement).dataset.view
    btn.classList.toggle('active', v === view)
  })
}

function pushHistory(line: string) {
  history.unshift(`${new Date().toLocaleString()} — ${line}`)
  $('history-list').innerHTML = history
    .slice(0, 20)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')
}

function setStatus(title: string, sub: string) {
  $('status-title').textContent = title
  $('status-sub').textContent = sub
}

function renderAuthUi(signedIn: boolean, label?: string) {
  const authBtn = $('btn-auth')
  const avatar = $('btn-profile')
  if (signedIn) {
    authBtn.classList.add('hidden')
    avatar.classList.remove('hidden')
    avatar.textContent = label || '?'
  } else {
    authBtn.classList.remove('hidden')
    avatar.classList.add('hidden')
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
  renderAuthUi(true, initials(user?.display_name || '', user?.email || ''))
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
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `Profile HTTP ${res.status}`)
    }
    me = (await res.json()) as MePayload
    $('profile-error').classList.add('hidden')
  } catch (e) {
    me = null
    const msg = e instanceof Error ? e.message : String(e)
    const err = $('profile-error')
    err.textContent =
      'We could not load your Tools account details right now. You can still use Virus Check and Scam Check on this PC. Try Sign in again in a moment.'
    err.classList.remove('hidden')
    void msg
  }
  renderProfile()
}

async function ensureAuth() {
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

  const isAuth = await auth0.isAuthenticated()
  if (isAuth) {
    accessToken = (await auth0.getTokenSilently().catch(() => '')) || ''
    const user = await auth0.getUser()
    renderAuthUi(true, initials(user?.name || '', user?.email || ''))
    await loadProfile()
  } else {
    accessToken = ''
    me = null
    renderAuthUi(false)
    renderProfile()
  }
}

async function signIn() {
  if (!auth0) return
  await auth0.loginWithRedirect()
}

async function signOut() {
  if (!auth0) return
  accessToken = ''
  me = null
  await auth0.logout({ logoutParams: { returnTo: window.location.origin } })
}

function fakeScan(label: string) {
  setStatus('Checking…', 'Please wait a moment')
  $('scan-log').textContent = `${label}…\nLooking for anything that could harm your computer.\n`
  window.setTimeout(() => {
    setStatus('Looking good', 'No problems found on this check')
    $('scan-log').textContent += 'Result: safe to use.\n'
    pushHistory(`${label}: safe to use`)
    show('home')
  }, 900)
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
  if (/urgent|act now|verify account|gift card|wire transfer/.test(lower)) hits.push('Tries to rush you into paying or sharing details')
  if (/https?:\/\/\d+\.\d+\.\d+\.\d+/.test(lower)) hits.push('Odd web address that does not look like a normal company site')
  if (hits.length) {
    log.textContent =
      `This looks unsafe. Do not open the link or send money until you confirm with the real person or company.\n\nWhy we are worried:\n- ${hits.join('\n- ')}`
    pushHistory('Scam check: looks unsafe')
  } else {
    log.textContent = 'No virus or scam found in the usual warning signs. Still be careful if something feels wrong.'
    pushHistory('Scam check: no scam found')
  }
}

document.querySelectorAll('.nav-chip').forEach((btn) => {
  btn.addEventListener('click', () => show((btn as HTMLElement).dataset.view as View))
})

$('btn-quick').addEventListener('click', () => {
  show('scan')
  fakeScan('Quick check')
})
$('btn-full').addEventListener('click', () => {
  show('scan')
  fakeScan('Full check')
})
$('btn-plans').addEventListener('click', () => window.open(TOOLS_PLANS_URL, '_blank', 'noreferrer'))
$('btn-auth').addEventListener('click', () => void signIn())
$('btn-auth-profile').addEventListener('click', () => void signIn())
$('btn-signout').addEventListener('click', () => void signOut())
$('btn-profile').addEventListener('click', () => {
  show('profile')
  void loadProfile()
})

const drop = $('drop')
const input = $('file-input') as HTMLInputElement
$('btn-pick').addEventListener('click', () => input.click())
input.addEventListener('change', () => {
  const names = input.files ? Array.from(input.files).map((f) => f.name) : []
  if (!names.length) return
  $('scan-log').textContent =
    `Ready to check:\n${names.map((n) => `- ${n}`).join('\n')}\n\nYour file stays on this computer while we look for problems.`
  pushHistory(`Checked selection: ${names.length} file(s)`)
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
  $('scan-log').textContent =
    `Ready to check:\n${names.map((n) => `- ${n}`).join('\n')}\n\nYour file stays on this computer while we look for problems.`
  pushHistory(`Checked drop: ${names.length} file(s)`)
})

$('btn-scam').addEventListener('click', () => {
  checkScam(($('scam-text') as HTMLTextAreaElement).value)
})

void ensureAuth().then(() => show('home'))
