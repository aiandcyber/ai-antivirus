# ai-antivirus

AI Powered Anti-Virus — Windows / Mac desktop (Tauri 2).

## Develop (WSL or Windows)

```bash
cd ai-antivirus
npm install
npm run dev          # UI at http://127.0.0.1:1430
```

## Windows app (build on Windows after git pull)

```powershell
cd C:\09_Development\ai-cybersecurity\ai-antivirus
npm install
npm run tauri build
```

Requires Rust + WebView2. Do **not** copy files from WSL — only `git pull` from GitHub.

## Code path

WSL edit → `git push` → Windows `git pull` → Studio/Tauri build.
