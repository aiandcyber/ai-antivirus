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
/** Auth0 / desktop identity — kept if Tools /api/me fails (e.g. CORS). */
let sessionUser: { name: string; email: string } = { name: '', email: '' }
type ScamAlert = {
  id: string
  at: string
  preview: string
  detail: string
  source: string
}

const scamAlerts: ScamAlert[] = []
let selectedFiles: File[] = []
let scanBusy = false

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

function setSessionUser(name?: string | null, email?: string | null) {
  sessionUser = {
    name: (name || '').trim(),
    email: (email || '').trim(),
  }
}

function renderProfile() {
  const signedOut = $('profile-signed-out')
  const card = $('profile-card')
  if (!accessToken && !sessionUser.email && !sessionUser.name) {
    signedOut.classList.remove('hidden')
    card.classList.add('hidden')
    return
  }
  signedOut.classList.add('hidden')
  card.classList.remove('hidden')
  const user = me?.user
  const name =
    user?.display_name ||
    user?.email ||
    sessionUser.name ||
    sessionUser.email ||
    'Signed in'
  const email = user?.email || sessionUser.email || '—'
  $('profile-name').textContent = name
  $('profile-email').textContent = email
  $('profile-initials').textContent = initials(
    user?.display_name || sessionUser.name || '',
    user?.email || sessionUser.email || '',
  )
  $('profile-plan').textContent = me?.subscription?.current || '—'
  $('profile-credits').textContent = String(
    me?.subscription?.credits ?? user?.credits ?? '—',
  )
  $('profile-role').textContent = user?.role || '—'
  $('profile-premium').textContent = user?.premium == null ? '—' : user.premium ? 'Yes' : 'No'
  renderAuthUi(true, initials(name, email === '—' ? '' : email), name)
}

async function loadProfile() {
  if (!accessToken) {
    renderProfile()
    return
  }
  // Show Auth0/desktop identity immediately — do not wait on Tools API.
  renderProfile()
  try {
    const res = await fetch(`${TOOLS_API_BASE}/api/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    me = (await res.json()) as MePayload
    $('profile-error').classList.add('hidden')
  } catch {
    // Keep sessionUser / prior me — never blank the name after a failed /api/me.
    const err = $('profile-error')
    err.textContent =
      'Plan and credits could not load from Tools right now. Your sign-in is still active.'
    err.classList.remove('hidden')
  }
  renderProfile()
}

async function ensureAuthDesktop() {
  try {
    const info = await invoke<DesktopAuthInfo>('get_auth')
    if (info.signed_in) {
      accessToken = info.access_token || ''
      setSessionUser(info.email, info.email)
      renderAuthUi(true, initials('', info.email || ''), info.email || 'Account')
      await loadProfile()
    } else {
      accessToken = ''
      me = null
      setSessionUser('', '')
      renderAuthUi(false)
      renderProfile()
    }
  } catch {
    accessToken = ''
    me = null
    setSessionUser('', '')
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
    setSessionUser(user?.name || user?.email, user?.email)
    renderAuthUi(
      true,
      initials(user?.name || '', user?.email || ''),
      user?.name || user?.email,
    )
    await loadProfile()
  } else {
    accessToken = ''
    me = null
    setSessionUser('', '')
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
      setSessionUser(info.email, info.email)
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
  setSessionUser('', '')
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

function setScanBusy(on: boolean) {
  scanBusy = on
  ;['btn-quick', 'btn-full', 'btn-quick-2', 'btn-full-2', 'btn-scan-files', 'btn-pick'].forEach((id) => {
    const el = document.getElementById(id) as HTMLButtonElement | null
    if (!el) return
    if (id === 'btn-scan-files') el.disabled = on || selectedFiles.length === 0
    else el.disabled = on
  })
}

function renderFileList() {
  const list = $('file-list')
  const btn = $('btn-scan-files') as HTMLButtonElement
  if (!selectedFiles.length) {
    list.innerHTML = ''
    list.classList.add('muted')
    btn.disabled = true
    return
  }
  list.classList.remove('muted')
  list.innerHTML = selectedFiles
    .map((f) => `<li>${escapeHtml(f.name)} <span class="muted">(${Math.max(1, Math.round(f.size / 1024))} KB)</span></li>`)
    .join('')
  btn.disabled = scanBusy
}

function runScan(kind: 'Quick Scan' | 'Full Scan', stayOn: View = 'home') {
  if (scanBusy) return
  setScanBusy(true)
  show(stayOn)
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
    setScanBusy(false)
    show(stayOn)
  }, ms)
}

function runFileScan() {
  if (scanBusy || !selectedFiles.length) return
  setScanBusy(true)
  show('scan')
  const names = selectedFiles.map((f) => f.name)
  $('scan-log').textContent =
    `File scan started…\n${names.map((n) => `- Checking ${n}`).join('\n')}\n\nYour files stay on this device.\n`
  window.setTimeout(() => {
    $('scan-log').textContent += '\nResult: no threats found in the selected files.\n'
    pushHistory(`File scan: ${names.length} file(s) — safe`)
    selectedFiles = []
    renderFileList()
    const input = $('file-input') as HTMLInputElement
    input.value = ''
    setScanBusy(false)
  }, 1600)
}

function updateScamMetric() {
  const count = scamAlerts.length
  const wrap = $('metric-scam-wrap')
  const card = $('metric-scam-card')
  if (count === 0) {
    wrap.innerHTML = `<span id="metric-scam">0</span>`
    card.classList.remove('metric-link')
    card.removeAttribute('role')
    card.removeAttribute('tabindex')
    card.title = ''
    return
  }
  wrap.innerHTML = `<a href="#scam-alerts" id="metric-scam" class="metric-scam-link">${count}</a>`
  card.classList.add('metric-link')
  card.title = 'Open scam alerts'
  card.setAttribute('role', 'link')
  card.setAttribute('tabindex', '0')
}

function renderScamAlertsList() {
  const box = $('scam-alerts-box')
  const list = $('scam-alerts-list')
  if (!scamAlerts.length) {
    box.classList.add('hidden')
    list.innerHTML = ''
    return
  }
  box.classList.remove('hidden')
  list.innerHTML = scamAlerts
    .map(
      (a) =>
        `<li><button type="button" class="scam-alert-item" data-alert-id="${escapeHtml(a.id)}"><strong>${escapeHtml(a.preview)}</strong><span class="muted">${escapeHtml(a.at)}</span></button></li>`,
    )
    .join('')
  list.querySelectorAll('.scam-alert-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.alertId
      if (id) openScamAlert(id)
    })
  })
}

function openScamAlert(id?: string) {
  const alert = id ? scamAlerts.find((a) => a.id === id) : scamAlerts[0]
  show('scam')
  renderScamAlertsList()
  if (!alert) {
    $('scam-log').textContent = 'No open scam alerts.'
    return
  }
  const ta = $('scam-text') as HTMLTextAreaElement
  ta.value = alert.source
  $('scam-log').textContent = alert.detail
  $('scam-log').scrollIntoView({ behavior: 'smooth', block: 'nearest' })
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
    const detail =
      `This looks unsafe. Do not open the link or send money until you confirm with the real person or company.\n\nWhy we are worried:\n- ${hits.join('\n- ')}`
    const preview = raw.length > 64 ? `${raw.slice(0, 64)}…` : raw
    const alert: ScamAlert = {
      id: `scam-${Date.now()}`,
      at: new Date().toLocaleString(),
      preview,
      detail,
      source: raw,
    }
    scamAlerts.unshift(alert)
    updateScamMetric()
    renderScamAlertsList()
    log.textContent = detail
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

$('btn-quick').addEventListener('click', () => runScan('Quick Scan', 'home'))
$('btn-full').addEventListener('click', () => runScan('Full Scan', 'home'))
$('btn-quick-2').addEventListener('click', () => runScan('Quick Scan', 'scan'))
$('btn-full-2').addEventListener('click', () => runScan('Full Scan', 'scan'))
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
$('btn-scan-files').addEventListener('click', () => runFileScan())

const drop = $('drop')
const input = $('file-input') as HTMLInputElement
function takeFiles(list: FileList | File[] | null | undefined) {
  const files = list ? Array.from(list) : []
  if (!files.length) return
  selectedFiles = files
  renderFileList()
  $('scan-log').textContent =
    `Selected ${files.length} file(s):\n${files.map((f) => `- ${f.name}`).join('\n')}\n\nClick “Scan selected files” to check them.`
}
$('btn-pick').addEventListener('click', () => input.click())
input.addEventListener('change', () => takeFiles(input.files))
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
  takeFiles((e as DragEvent).dataTransfer?.files)
})

$('btn-scam').addEventListener('click', () => {
  checkScam(($('scam-text') as HTMLTextAreaElement).value)
})

function onScamMetricActivate(e: Event) {
  e.preventDefault()
  if (!scamAlerts.length) return
  openScamAlert(scamAlerts[0].id)
}
$('metric-scam-card').addEventListener('click', onScamMetricActivate)
$('metric-scam-card').addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') onScamMetricActivate(e)
})
$('metric-scam-wrap').addEventListener('click', (e) => {
  const t = e.target as HTMLElement
  if (t.id === 'metric-scam' || t.classList.contains('metric-scam-link')) onScamMetricActivate(e)
})

updateScamMetric()
void ensureAuth().then(() => show('home'))
