#!/usr/bin/env bash
set -euo pipefail
# Apply the Mission Control proxy_pass fix.
#
# The /agents/ location used proxy_pass http://127.0.0.1:8789/ (with a
# trailing slash and no path). That makes nginx strip the /agents/
# prefix before forwarding to Next.js, which has basePath: "/agents",
# so the upstream never sees a matching route — every request 404s and
# the CSS never loads.
#
# Fix: explicit /agents/ replacement, mirroring the /v1/agents/ location
# on the scraper vhost which works correctly.

if [[ $EUID -ne 0 ]]; then
  echo "Re-running with sudo…"
  exec sudo bash "$0" "$@"
fi

set -euo pipefail
cp /etc/nginx/sites-available/menuboard-marketing /etc/nginx/sites-available/menuboard-marketing.bak.$(date +%Y%m%d-%H%M%S)
sed -i 's#proxy_pass http://127.0.0.1:8789/;#proxy_pass http://127.0.0.1:8789/agents/;#' /etc/nginx/sites-available/menuboard-marketing
nginx -t
nginx -s reload
echo "✅ nginx config patched and reloaded."
echo "Test:  curl -I https://menuboard.online/agents/"
