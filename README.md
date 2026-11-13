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

Artifacts land on the repo **Releases** page. Mac builds are **unsigned** until Apple signing/notarization secrets are added (Gatekeeper will warn).

Manual Windows build (optional, after `git pull` on Windows):

```powershell
cd C:\09_Development\ai-cybersecurity\ai-antivirus
npm install
npm run tauri build
```

Requires Rust + WebView2. Do **not** copy files from WSL — only `git push` / `git pull` via GitHub.

## Code path

WSL edit → `git push` → GitHub Actions (Mac + Windows) and/or Windows `git pull` for local Tauri.
