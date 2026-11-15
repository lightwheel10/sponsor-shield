# Sponsor Shield server

The extension asks this server for AI-found sponsor parts when SponsorBlock has
none. The server holds the only copy of the DeepSeek key. The extension holds
no secrets.

Plain Python 3.12 standard library only (no packages to install), one SQLite file.

## How it stays safe

| Risk | What stops it |
| --- | --- |
| Someone steals the AI key | The key exists only in a root-only file on the VPS, loaded by systemd. It is never in the extension, in git, in logs or in error messages. |
| Someone runs up the AI bill | A hard daily budget (`SHIELD_DAILY_BUDGET_USD`, default $3), after which AI checks stop until the next UTC day. Each transcript is checked at most once. Each video has at most 3 AI runs a day. At most 4 checks run at once and 20 wait, and the rest are told "busy". Speed limits apply per network and per install, both in nginx and in the server. Transcripts over about 6 hours are refused. Videos must exist on YouTube, checked by asking YouTube itself. |
| Someone plants fake answers | Answers are tied to the exact transcript, description and paid label they came from. A fake transcript only ever fools the person who sent it. An answer is shown to people who have not sent a transcript only after 2 different installs on 2 different networks sent the identical one. If rival answers exist, the one confirmed by the most networks wins. Answers that blur over 40% of a video, or have over 15 parts, are never shared. |
| Ordinary websites misuse the API | No CORS headers, and JSON-only POSTs, so a web page cannot read answers or post to the API from a visitor's browser. |
| Privacy | No IP addresses or install IDs are stored, only one-way codes made with a server secret. Logs hold the route and status only. |
| The service gets broken into | It runs as its own Linux user, can write only its own database folder, and listens on 127.0.0.1 behind nginx. |

What it cannot stop: someone with many installs on many networks could still
confirm a fake answer for one video. That costs them real effort per video,
the answer is still capped at 40% of the video, viewers keep the "Show anyway"
button, and `python -m shield.admin forget VIDEO_ID` removes it.

## Known behaviour: more than one caption version

YouTube can serve different versions of a video's auto-captions. The track
list names them, for example `variant=gemini` or `variant=timing-optimized`,
and the version for one video changed between two checks on 14 Nov 2026.
Viewers who got the same version produce the same fingerprint and confirm
each other. A video can therefore get one AI check per caption version
instead of one in total. The per-video daily cap (3) limits this.

## Run the tests

```bash
cd server
PYTHONPATH=. python -m unittest discover -s tests
```

## Settings (environment variables)

| Name | Required | Meaning |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | yes | DeepSeek key, used only by this server |
| `SHIELD_HASH_SECRET` | yes | 32+ random characters, for the one-way codes |
| `SHIELD_DAILY_BUDGET_USD` | no (3) | AI spending ceiling per UTC day |
| `YOUTUBE_API_KEY` | no | Turns on the real-video-length check |
| `SHIELD_DATABASE`, `SHIELD_HOST`, `SHIELD_PORT` | no | Set in the service file |
| `SHIELD_MAX_PARALLEL_AI_JOBS`, `SHIELD_MAX_WAITING_AI_JOBS`, `SHIELD_MAX_AI_RUNS_PER_VIDEO_PER_DAY`, `SHIELD_CONFIRMATIONS_NEEDED` | no | Limits described above |

## Deploy on the VPS (done 15 Nov 2026; these are the steps used)

1. Point a DNS record for `sponsor-shield.spectrumailabs.com` to the VPS.
2. `useradd --system --no-create-home --shell /usr/sbin/nologin sponsorshield`
3. Copy `server/` to `/opt/sponsor-shield/server` and `store/privacy.html` to `/opt/sponsor-shield/privacy.html` (owned by root, readable by all). nginx serves the policy at `/privacy`.
4. Create `/etc/sponsor-shield.env` with `chmod 600`, owned by root:
   ```
   DEEPSEEK_API_KEY=...        # a NEW key used only for Sponsor Shield
   SHIELD_HASH_SECRET=...      # e.g. from: python3 -c "import secrets;print(secrets.token_hex(32))"
   SHIELD_DAILY_BUDGET_USD=1   # the live server uses $1 a day
   ```
5. Install `deploy/sponsor-shield.service`, then run `systemctl enable --now sponsor-shield`.
6. Install `deploy/nginx-sponsor-shield.conf`, run `nginx -t`, reload nginx, then run `certbot --nginx -d sponsor-shield.spectrumailabs.com`.
7. Check that `curl https://sponsor-shield.spectrumailabs.com/healthz` returns `{"ok": true}`.

## Owner tools (run on the VPS)

```bash
cd /opt/sponsor-shield/server
sudo -u sponsorshield SHIELD_DATABASE=/var/lib/sponsor-shield/shield.sqlite3 python3 -m shield.admin status
#   ... ai off | ai on | forget VIDEO_ID
```
