# Running Ollama on the Mac mini (reached from the MacBook over the home network)

> **Status (2026-10-06):** not set up. The small open model is the optional Milestone 8 (`docs/PROJECT.md`); these steps are kept for then.

Local models run on the **M2 Mac mini (16 GB)** for **development**. The MacBook only sends requests to it. Official eval runs and the public demo use the same model served by vLLM on Modal instead.
Ollama needs **macOS 14 (Sonoma) or newer** on the Mac mini ( → About This Mac).

## 1. Install Ollama (on the Mac mini)
1. Download `Ollama.dmg` from https://ollama.com/download.
2. Open it and drag **Ollama** into **Applications**.
3. Launch Ollama from Applications. When it asks to install the command-line tool (a link in `/usr/local/bin`), allow it.
4. Check it in Terminal:
   ```sh
   ollama --version
   curl http://localhost:11434/api/version
   ```

## 2. Let other machines connect, and set the context size
By default Ollama only listens on `localhost`. Three settings, run in Terminal on the Mac mini:
```sh
launchctl setenv OLLAMA_HOST "0.0.0.0:11434"      # listen on the network, not just localhost
launchctl setenv OLLAMA_CONTEXT_LENGTH "16384"    # default is 4096: our prompts are longer and would be silently cut off
launchctl setenv OLLAMA_KEEP_ALIVE "30m"          # keep the model loaded between eval calls (default 5 min)
```
Then **quit Ollama** (menu-bar llama icon → Quit) and **open it again**, so it picks up the settings.

Why each one:
- `OLLAMA_HOST=0.0.0.0` means "accept connections on every network interface", so the MacBook can reach it.
- `OLLAMA_CONTEXT_LENGTH`: our client uses the OpenAI-compatible endpoint, which can't set the context size per request. It has to be set on the server.
- `OLLAMA_KEEP_ALIVE`: reloading a model takes seconds. Keeping it loaded makes eval runs much faster.

**The first time** a machine connects, macOS may ask "Do you want the application Ollama to accept incoming network connections?". Click **Allow**. (If you clicked Deny: System Settings → Network → Firewall → Options → set Ollama to "Allow incoming connections".)

**`launchctl setenv` doesn't survive a reboot.** To make it permanent, create a login agent that sets the variables at every login. On the Mac mini:
```sh
cat > ~/Library/LaunchAgents/com.agentdesk.ollama-env.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.agentdesk.ollama-env</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string><string>-c</string>
    <string>launchctl setenv OLLAMA_HOST 0.0.0.0:11434; launchctl setenv OLLAMA_CONTEXT_LENGTH 16384; launchctl setenv OLLAMA_KEEP_ALIVE 30m</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/com.agentdesk.ollama-env.plist
```
Also set Ollama to open at login (System Settings → General → Login Items → add Ollama). A reboot then comes back fully configured.

**Keep the Mac mini awake:** System Settings → Energy → turn on **"Prevent automatic sleeping when the display is off"** (and "Wake for network access" if shown). A sleeping Mac mini makes eval runs fail midway.

## 3. Find the Mac mini's address
On the Mac mini, either:
- **IP address:** `ipconfig getifaddr en0` (Ethernet is usually `en0`; on Wi-Fi try `en1` if `en0` prints nothing), or System Settings → Network → (connection) → Details → IP address. It looks like `192.168.1.50`.
- **Local hostname (recommended):** System Settings → General → Sharing → "Local hostname", e.g. `julians-mac-mini.local`. Unlike the IP, this doesn't change when the router hands out a new address. (Alternative: reserve a fixed IP for the Mac mini in your router's DHCP settings.)

## 4. Test the connection from the MacBook
Replace the address with yours:
```sh
curl http://julians-mac-mini.local:11434/api/version     # → {"version":"..."}
curl http://julians-mac-mini.local:11434/v1/models       # → the list of pulled models
```
If `curl` hangs or says "connection refused":
- `refused` → Ollama is still listening only on localhost. Redo step 2 and **restart Ollama**. On the Mac mini, `lsof -iTCP:11434 -sTCP:LISTEN` should show `*:11434`, not `localhost:11434`.
- hangs / times out → the firewall blocked it, the address is wrong, or the two machines are on different networks (e.g. a guest Wi-Fi).

Then point the project at it in `.env` on the MacBook:
```sh
OLLAMA_BASE_URL=http://julians-mac-mini.local:11434
```
and run the smoke test: `npm run smoke -- ollama/qwen3.5-4b`.

## 5. Pull models (on the Mac mini)
```sh
ollama pull qwen3.5:4b
ollama list
```
The smoke test prints the model's context window. It should say **16384**; 4096 means step 2 didn't take effect.

## Security note
Ollama has **no login or API key**. With `OLLAMA_HOST=0.0.0.0`, anyone on your home network can use it. That's fine on a trusted home network, but **never port-forward 11434** on your router, which would expose it to the internet. The public demo and official eval runs don't use this machine; they use vLLM on Modal (see PROGRESS.md).
