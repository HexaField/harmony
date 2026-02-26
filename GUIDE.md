# Harmony Guide

Everything you need to get started with Harmony, whether you're joining a community, running your own, or migrating from Discord.

---

## Getting Harmony

### Desktop App (recommended)

Download the Harmony desktop app for your platform:

- **macOS:** `Harmony.dmg`
- **Windows:** `Harmony-Setup.exe`
- **Linux:** `Harmony.AppImage` or `harmony.deb`

> **Note:** Pre-built binaries are not yet available for download. To create distributable builds from source, clone the repo and run `pnpm electron:build` from `packages/app/`. See the README for build prerequisites.

The desktop app is the easiest way to use Harmony. It runs a personal server on your machine so your data stays with you. When you launch the app, you're not just connecting to someone else's server — you're running your own.

### Web App

If you don't want to install anything, you can use Harmony in a browser. Visit the web UI hosted by whatever community you're joining (they'll give you the URL). The experience is the same, but your data lives on their server rather than your machine.

### Command Line (power users)

Install the CLI globally:

```
npm install -g @harmony/cli
```

Run `harmony --help` to see all available commands. Everything the desktop app can do, the CLI can do too.

---

## Your First Launch

When you open Harmony for the first time, you'll see three options:

1. **Create your identity** — Start fresh with a new sovereign identity
2. **Recover existing identity** — Restore an identity from a 12-word recovery phrase
3. **Import from Discord** — Migrate a Discord community (takes you through the migration wizard)

### Creating an identity

Choose "Create your identity." Harmony will generate a 12-word recovery phrase and display it on screen.

**Write this phrase down on paper and store it somewhere safe.** This is the only way to recover your identity if you lose access to your device. Harmony doesn't have a "forgot password" option — your identity is yours alone, and nobody else can reset it.

You'll be asked to verify a few words to confirm you've saved the phrase. After that, Harmony creates your identity and you'll land on the home screen with options to create a community, join one, or import from Discord.

### Recovering an identity

Choose "Recover existing identity" and enter your 12-word recovery phrase. Harmony will restore your identity, including all your credentials, linked accounts, and community memberships.

### Using the CLI

```
harmony init
```

This walks you through the same setup interactively in your terminal: create or recover an identity, configure your server connection, and save your settings.

---

## Joining a Community

Someone will share an invite link with you. It looks like this:

```
harmony.chat/invite/abc123
```

**From the desktop app:** Click the link. If Harmony is installed, it opens directly and asks you to confirm joining. If it's your first time, you'll create an identity first, then join automatically.

**From the web:** Open the link in a browser. If you don't have Harmony installed, you'll see a landing page with the community name, a description, and a download button. If you're already using the web app, you'll be taken straight to the join screen.

**From the CLI:**

```
harmony community join harmony.chat/invite/abc123
```

Once you've joined, the community appears in your server list on the left. Click it to see channels, members, and start chatting.

---

## Creating a Community

### Choosing where to host

When you create a community, Harmony asks where it should live. You'll see the options available in your environment:

- **💻 This device** — Runs a server on your computer. Free, private, fully under your control. Available in the desktop app.
- **☁️ Harmony Cloud** — Hosted for you. Always online, no setup required. Available when cloud hosting is configured.
- **🔗 Existing server** — Connect to a server you or someone else is already running. Always available.

In the desktop app, all three options may appear. In the web app, you'll typically see Cloud and Existing server. If only one option is available, the choice is made automatically and you go straight to naming your community.

### From the desktop app

1. Click the **+** button in the server list
2. Choose "Create a community"
3. Pick where to host it (or this step is skipped if only one option)
4. Enter a name and optional description
5. Your community is live immediately

If you chose "This device," the desktop app starts a local server in the background. If you chose Cloud, a managed instance is provisioned automatically. Either way, you don't need to configure anything — it just works.

### From the web app

1. Click "Create a community" on the home screen
2. Choose Cloud or enter an existing server URL
3. Enter a name and description
4. Done — share the invite link

### From the CLI

```
harmony community create "My Community"
```

This creates the community on whatever server you're connected to (your local node by default).

### Sharing your community

Generate an invite link:

1. Open community settings (click the community name at the top)
2. Go to "Invites"
3. Click "Create invite link"
4. Copy the link and share it

Or from the CLI:

```
harmony community invite
```

The link works for anyone, on any platform. They'll be guided through getting Harmony if they don't have it yet.

---

## Migrating from Discord

This is for community admins who want to bring their Discord server's history, channels, roles, and members into Harmony. Members don't need to do anything until the migration is ready — they'll get an invite link like any other new community.

### Using the Desktop App (recommended)

The desktop app has a step-by-step migration wizard. Click "Import from Discord" on the home screen (or find it in settings under "Migration").

**Step 1: Choose what to migrate**

You'll see two options:

- **Migrate a community** — Export your Discord server's channels, messages, roles, and members into a new Harmony community.
- **Link your Discord account** — Just connect your Discord identity to your Harmony DID, without migrating any community data.

If you choose to migrate a community, continue to Step 2.

**Step 2: Choose where to host**

Your migrated community needs a Harmony server. Pick where it should live:

- **💻 This device** — The desktop app starts a local server. Best for small communities or testing.
- **☁️ Harmony Cloud** — Managed hosting, always online. Best for active communities.
- **🔗 Existing server** — Use a server you've already set up (VPS, homelab, etc).

The server is provisioned automatically — you don't need to configure anything.

**Step 3: Create a Discord bot**

The wizard walks you through creating a bot that will read your Discord server's history:

1. Click the link to open the [Discord Developer Portal](https://discord.com/developers/applications) (opens in a new tab)
2. Click "New Application" and give it a name (anything works)
3. Go to the "Bot" section in the left sidebar
4. Click "Reset Token" and copy the token
5. Scroll down and enable "Message Content Intent" and "Server Members Intent"
6. Go back to the wizard and paste the token

**Step 4: Add the bot to your Discord server**

The wizard generates an invite link with the right permissions. Click it, select your Discord server, and authorise.

**Step 5: Choose what to export**

The wizard shows your Discord server's channels and member count. Select the server and review what will be exported:

- All text channels and their message history
- Threads
- Roles and permissions
- Member list
- Server metadata (name, description, icon)

DMs are never touched. The bot only reads community channels.

**Step 6: Run the export**

Click "Start export." You'll see real-time progress:

- Which channel is being exported
- How many messages have been processed
- Estimated time remaining

A small server (a few thousand messages) takes under a minute. Large servers with hundreds of thousands of messages might take 10–20 minutes.

You can cancel at any time without losing anything on the Discord side.

**Step 7: Your community is ready**

When the export finishes, you'll see a summary of what was imported. Your community is now live — hosted wherever you chose in Step 2 — with all the history, channels, and roles from Discord.

The wizard gives you:

- An invite link to share with your community
- A template message you can post in your Discord server to let people know

**Step 8: Invite your members**

Post the invite link in your Discord server. When members click it:

1. They download Harmony (or open the web app)
2. They create an identity
3. They join the community and see the full history
4. They can link their Discord account so their old messages show up under their Harmony identity

### Using the CLI

For admins who prefer the terminal:

```
harmony migrate discord
```

This runs the same process interactively: prompts for a bot token, lets you select a server, shows progress, and outputs an invite link at the end.

For scripting or automation:

```
harmony migrate discord --token BOT_TOKEN --guild GUILD_ID
```

### Using the Standalone Discord Bot

For larger communities or admins who want a persistent bot (with slash commands and automated member DMs), there's a standalone Discord bot that runs on a server.

Set up with Docker:

```
docker compose --profile with-bot up -d
```

Or run it directly:

```
DISCORD_TOKEN=your-bot-token harmony-bot
```

Once running, use slash commands in Discord:

| Command                  | What it does                                       |
| ------------------------ | -------------------------------------------------- |
| `/harmony setup`         | Configure Harmony for this server (admin only)     |
| `/harmony export`        | Start exporting to Harmony (admin only)            |
| `/harmony export status` | Check export progress                              |
| `/harmony link`          | Link your Discord account to your Harmony identity |
| `/harmony identity`      | Show your linked Harmony identity                  |
| `/harmony info`          | Show Harmony info and invite link                  |

The bot handles everything: exporting, progress reporting in the channel, and DMing each member with a link to connect their accounts.

---

## Linking Your Discord Account

Linking connects your Discord identity to your Harmony identity. This means:

- Your messages from the migrated history show up under your Harmony name
- Your roles and permissions carry over
- Friends who've also linked are automatically discoverable
- You can prove you're the same person across both platforms

### From the desktop app or web

1. Go to Settings → Identity
2. Click "Link Discord account"
3. You'll be redirected to Discord to authorise
4. Once authorised, the link is created

### From the CLI

```
harmony identity link discord
```

This opens a browser window for the Discord authorisation flow.

### From Discord (if the bot is running)

Type `/harmony link` in any channel where the bot is active. The bot will DM you a link to complete the process.

### Finding Discord friends on Harmony

Once you've linked your account:

**Desktop/web:** Go to Friends → "Find Discord friends." Harmony checks which of your Discord contacts have also linked their accounts and suggests connections.

**CLI:**

```
harmony friends find --discord
```

---

## Running a Dedicated Server

The desktop app is great for small communities, but if you want always-on hosting (so the community stays available when your laptop is closed), run a dedicated server on a VPS, homelab, or Raspberry Pi.

### With Docker (recommended)

1. Copy the deployment files to your server:
   - `docker-compose.yml`
   - `.env.example` → rename to `.env`
   - `harmony.config.example.yaml` → rename to `harmony.config.yaml`

2. Edit `.env` with your settings:
   - `HARMONY_PORT` — the port for the WebSocket server (default: 4000)
   - `HARMONY_UI_PORT` — the port for the web UI (default: 8080)
   - `HARMONY_PORTAL_URL` — the portal service URL (default: the public portal)
   - `DISCORD_TOKEN` — only if you're running the Discord bot

3. Edit `harmony.config.yaml` with your identity and preferences (see the "Server Configuration" section below).

4. Start it:

   ```
   docker compose up -d
   ```

   This brings up the Harmony server and the web UI. Your community is accessible at `http://your-server:8080`.

5. To include the Discord migration bot:

   ```
   docker compose --profile with-bot up -d
   ```

6. Check it's running:

   ```
   docker compose logs -f server
   ```

7. Stop it:

   ```
   docker compose down
   ```

Data is stored in Docker volumes. It persists across restarts and updates.

### With the CLI

If you'd rather not use Docker:

```
harmony server start --config harmony.config.yaml
```

This runs the server in the foreground. Use a process manager (systemd, pm2, etc.) to keep it running.

Check status:

```
harmony server status
```

Stop:

```
harmony server stop
```

### Server Configuration

The server reads a YAML config file. Here's what you can set:

| Setting                              | What it controls                               | Default                    |
| ------------------------------------ | ---------------------------------------------- | -------------------------- |
| `server.host`                        | Network interface to bind to                   | `0.0.0.0` (all interfaces) |
| `server.port`                        | WebSocket port                                 | `4000`                     |
| `server.tls.cert` / `server.tls.key` | TLS certificate paths                          | None (unencrypted)         |
| `storage.database`                   | Path to the SQLite database                    | `./harmony.db`             |
| `storage.media`                      | Path for encrypted media files                 | `./media`                  |
| `identity.mnemonic`                  | Your 12-word recovery phrase                   | Required                   |
| `federation.enabled`                 | Allow connections from other Harmony servers   | `true`                     |
| `relay.enabled`                      | Register with a portal relay for NAT traversal | `true`                     |
| `relay.url`                          | Cloud relay address                            | `wss://relay.harmony.chat` |
| `voice.enabled`                      | Enable voice and video channels                | `false`                    |
| `voice.livekit.host`                 | LiveKit server address                         | Required if voice enabled  |
| `moderation.rateLimit.maxMessages`   | Max messages per minute per user               | `30`                       |
| `logging.level`                      | Log detail: `debug`, `info`, `warn`, `error`   | `info`                     |
| `limits.maxConnections`              | Maximum simultaneous connections               | `1000`                     |
| `limits.mediaMaxSize`                | Maximum upload size in bytes                   | `52428800` (50 MB)         |

For TLS, you'll want a certificate from Let's Encrypt or similar. If you're behind a reverse proxy (nginx, Caddy), the proxy can handle TLS and you can leave the server unencrypted.

### Moving a community from desktop to dedicated server

If your community started on your laptop and you want to move it to a VPS:

1. In the desktop app, go to community settings → "Export community" _(Coming soon)_
2. Save the export file
3. Transfer it to your server
4. On the server:

   ```
   harmony community import community.hbundle
   ```

   _(Coming soon — the `.hbundle` export/import format is not yet implemented)_

5. Share the new invite link with your community

Members reconnect automatically or via the new invite. The community keeps its full history, roles, and member list.

---

## Deploying the Cloud Service

The portal service provides three things that make Harmony easier to adopt:

1. **NAT relay** — Most home networks block incoming connections. The relay lets desktop nodes accept connections from the outside world without port forwarding. The relay only sees encrypted traffic.

2. **Identity linking** — Handles the Discord OAuth flow for linking accounts. Stores the mapping between Discord user IDs and Harmony DIDs.

3. **Invite resolution** — Makes `harmony.chat/invite/abc` links work. Shows a landing page for people who don't have Harmony yet, and deep-links into the app for people who do.

The public portal at `portal.harmony.chat` provides all of this for free. You only need to self-host the portal if you want full independence from any external service.

### Self-hosting the portal

The portal runs on Cloudflare Workers. You'll need a Cloudflare account (free tier works).

1. Clone the Harmony repo
2. Configure your Cloudflare resources:
   - **D1 database** — stores identity links and invite metadata
   - **R2 bucket** — stores encrypted community export bundles
   - **KV namespace** — rate limiting and OAuth state
3. Set your environment variables:
   - `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` — from the Discord Developer Portal (create an OAuth2 application)
   - `DISCORD_REDIRECT_URI` — your portal URL + `/api/oauth/discord/callback`
   - `ALLOWED_ORIGINS` — domains that can call the API
4. Deploy:

   ```
   cd packages/portal-worker
   wrangler deploy
   ```

5. Point your Harmony instances at your portal URL by setting `relay.url` and the portal URL in their config.

The portal service is the same open-source code whether you run it yourself or use the public instance. Nothing is feature-gated.

---

## Day-to-Day Usage

### Channels and messaging

The interface works like you'd expect if you've used Discord. Server list on the left, channels in a sidebar, messages in the centre, member list on the right.

- Click a channel to open it
- Type a message and press Enter to send
- Drag and drop files to upload them (they're encrypted automatically)
- Use markdown: **bold**, _italic_, `code`, `code blocks`
- React to messages by hovering and clicking the emoji button
- Start a thread by right-clicking a message _(Coming soon)_
- Search with Ctrl+K (or Cmd+K on macOS)

All messages are end-to-end encrypted. The server never sees your message content.

### Voice and video

> **Note:** Voice and video require a [LiveKit](https://livekit.io/) server, which must be set up separately. This is optional — communities work fully without it. If voice is not configured, voice channels will not appear.

Click a voice channel to join. Controls appear at the bottom of the screen:

- Mute/unmute your microphone
- Turn camera on/off
- Share your screen
- Leave the call

Voice requires a LiveKit server. Community admins configure this in their server settings. If voice isn't set up, voice channels won't appear.

#### Self-Hosted LiveKit

1. Install LiveKit server: https://docs.livekit.io/home/self-hosting/local/
2. Configure in your server settings:
   ```yaml
   voice:
     enabled: true
     livekit:
       host: ws://localhost:7880
       apiKey: your-api-key
       apiSecret: your-api-secret
   ```
3. Voice channels will automatically use LiveKit for media routing.
4. Video and screen sharing are supported — controls appear in the voice bar when connected.

#### Without LiveKit

Voice channels will show as available but connecting will show an error. Voice, video, and screen sharing all require a running LiveKit server.

### Direct messages

Click the DM icon to see your conversations. Start a new one by clicking a user's name anywhere in the app and choosing "Message."

DMs are encrypted directly between you and the other person. They don't go through any community server.

### Managing a community

If you're an admin:

- **Roles:** Community Settings → Roles. Create roles, assign permissions, drag to reorder priority.
- **Members:** Community Settings → Members. Assign roles, remove members.
- **Invites:** Community Settings → Invites. Create, revoke, and track invite links.
- **Moderation:** Community Settings → Moderation. Set rate limits, enable raid detection, configure filters.
- **Bots:** Community Settings → Bots. Install bots, manage their permissions (bots use the same ZCAP delegation system as users — scoped, revocable permissions).
- **Governance:** Community Settings → Governance. Create proposals that require community votes before taking effect. Useful for rule changes, admin elections, or any decision the community should make together.

From the CLI, every management task has a corresponding command:

```
harmony channel create "announcements"
harmony community invite
harmony server status
```

Run `harmony --help` for the full list.

---

## Troubleshooting

**I lost my recovery phrase.** If you set up social recovery (Settings → Identity → Recovery), contact 3 of your 5 recovery contacts to restore your identity. If you didn't set up social recovery, the identity is unrecoverable. This is the tradeoff of sovereign keys — nobody else can access your identity, which also means nobody else can recover it for you.

**The migration bot can't see my Discord channels.** In the Discord Developer Portal, make sure your bot has the "Message Content Intent" and "Server Members Intent" enabled. When inviting the bot, it needs Read Messages, Read Message History, and View Channels permissions.

**My community is offline when my laptop is closed.** Your desktop runs the server. When it's off, the community is off. Options: keep the app running (it minimises to the system tray), set up federation with another node that's always on, or move the community to a dedicated server (VPS or homelab).

**Members can't connect to my community.** You're probably behind NAT (most home networks are). Make sure the relay is enabled in your settings — it routes connections through the portal relay automatically. If the relay is also not working, check your internet connection and that `relay.url` in your config points to a working relay.

**I want to move from the public portal to self-hosted.** Change `relay.url` and the portal URL in your config to point at your own portal deployment. Export and re-import any identity links if needed. The transition is seamless — same protocol, same code, different address.

**Server won't start.** Check your config file for syntax errors. Run `harmony server start --foreground` to see error output directly. Common issues: port already in use, invalid mnemonic, missing SQLite.

**Docker containers keep restarting.** Check logs: `docker compose logs server`. Usually it's a missing or invalid config file, or the database path isn't writable.
