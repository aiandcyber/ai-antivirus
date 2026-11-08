type View = 'home' | 'scan' | 'scam' | 'history'

const history: string[] = []

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing #${id}`)
  return el
}

function show(view: View) {
  document.querySelectorAll('.view').forEach((el) => el.classList.add('hidden'))
  $(`view-${view}`).classList.remove('hidden')
  document.querySelectorAll('.nav').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.view === view)
  })
}

function pushHistory(line: string) {
  const stamp = new Date().toLocaleString()
  history.unshift(`${stamp} — ${line}`)
  const list = $('history-list')
  list.innerHTML = history
    .slice(0, 20)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function setStatus(title: string, sub: string, kind: 'safe' | 'warn' = 'safe') {
  $('status-title').textContent = title
  $('status-sub').textContent = sub
  const card = document.querySelector('.status-card')
  if (card) {
    card.classList.toggle('safe', kind === 'safe')
  }
}

function fakeScan(label: string) {
  setStatus('Scanning…', label, 'warn')
  $('scan-log').textContent = `Starting ${label}…\nEngine placeholder — ClamAV/YARA wiring next.\n`
  window.setTimeout(() => {
    setStatus('Secure', `No threats found · ${label} finished`, 'safe')
    $('scan-log').textContent += 'Result: clean (demo).\n'
    pushHistory(`${label}: clean`)
    show('home')
  }, 900)
}

function checkScam(text: string) {
  const raw = text.trim()
  const log = $('scam-log')
  if (!raw) {
    log.textContent = 'Paste a message or URL first.'
    return
  }
  const lower = raw.toLowerCase()
  const hits: string[] = []
  if (/bit\.ly|tinyurl|t\.co\//.test(lower)) hits.push('Shortened URL')
  if (/urgent|act now|verify account|gift card|wire transfer/.test(lower)) hits.push('Pressure / payment language')
  if (/https?:\/\/\d+\.\d+\.\d+\.\d+/.test(lower)) hits.push('Raw IP link')
  if (hits.length) {
    log.textContent = `Possible scam signals:\n- ${hits.join('\n- ')}\n\nDo not open links or send money until you verify the sender.`
    pushHistory(`Scam check: risk (${hits.join(', ')})`)
  } else {
    log.textContent = 'No common scam patterns found (local heuristics only).'
    pushHistory('Scam check: no common patterns')
  }
}

document.querySelectorAll('.nav').forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = (btn as HTMLElement).dataset.view as View
    show(view)
  })
})

$('btn-quick').addEventListener('click', () => {
  show('scan')
  fakeScan('Quick scan')
})
$('btn-full').addEventListener('click', () => {
  show('scan')
  fakeScan('Full scan')
})

const drop = $('drop')
const input = $('file-input') as HTMLInputElement
$('btn-pick').addEventListener('click', () => input.click())
input.addEventListener('change', () => {
  const names = [...(input.files ?? [])].map((f) => f.name)
  if (!names.length) return
  $('scan-log').textContent = `Selected:\n${names.map((n) => `- ${n}`).join('\n')}\n\nDemo: files are not uploaded. Engine wiring next.`
  pushHistory(`Files selected: ${names.length}`)
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
  const dt = (e as DragEvent).dataTransfer
  const names = [...(dt?.files ?? [])].map((f) => f.name)
  if (!names.length) return
  $('scan-log').textContent = `Dropped:\n${names.map((n) => `- ${n}`).join('\n')}\n\nDemo: local only.`
  pushHistory(`Files dropped: ${names.length}`)
})

$('btn-scam').addEventListener('click', () => {
  checkScam(($('scam-text') as HTMLTextAreaElement).value)
})

show('home')
