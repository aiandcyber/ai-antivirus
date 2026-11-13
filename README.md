# ai-antivirus

AI Powered Anti-Virus — Windows / Mac desktop (Tauri 2).

## Develop (WSL or Windows)

```bash
cd ai-antivirus
npm install
npm run dev          # UI at http://127.0.0.1:1430
```

## Desktop installers (no local Mac required)

WSL edit → `git push` → GitHub Actions (`.github/workflows/tauri-release.yml`) builds:

- **Windows** on `windows-latest`
- **macOS** on `macos-latest` (`.dmg` / `.app`)

**User download page** (images + Download buttons, no file list): enable GitHub Pages for `/docs`  
→ https://aiandcyber.github.io/ai-antivirus/

Tools app also auto-picks the right `.exe` / `.dmg` from the latest Release. Mac builds are **unsigned** until Apple notarization secrets are added.

Manual Windows build (optional, after `git pull` on Windows):

```powershell
cd C:\09_Development\ai-cybersecurity\ai-antivirus
npm install
npm run tauri build
```

Requires Rust + WebView2. Do **not** copy files from WSL — only `git push` / `git pull` via GitHub.

## Code path

WSL edit → `git push` → GitHub Actions (Mac + Windows) and/or Windows `git pull` for local Tauri.
