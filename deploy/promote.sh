#!/bin/bash
# Promote staging to production (zero-downtime)
set -e

CADDY_CONFIG="/opt/n8n-docker-caddy/caddy_config"

# Get current colors
CURRENT_LIVE=$(cat "$CADDY_CONFIG/active_color" 2>/dev/null || echo "blue")

if [ "$CURRENT_LIVE" = "blue" ]; then
    NEW_LIVE="green"
    OLD_LIVE="blue"
else
    NEW_LIVE="blue"
    OLD_LIVE="green"
fi

echo "=== Promoting Staging to Production ==="
echo ""
echo "📍 Current production: colab-$OLD_LIVE"
echo "🚀 New production: colab-$NEW_LIVE"
echo ""

# Verify new container is running and healthy
echo "Verifying colab-$NEW_LIVE is healthy..."
if ! docker ps | grep -q "colab-$NEW_LIVE"; then
    echo "❌ Error: colab-$NEW_LIVE is not running!"
    echo "Run ./deploy.sh first to deploy to staging."
    exit 1
fi

HEALTH_CHECK=$(docker exec colab-$NEW_LIVE wget -q -O /dev/null http://localhost:3000 && echo "ok" || echo "fail")
if [ "$HEALTH_CHECK" != "ok" ]; then
    echo "❌ Error: colab-$NEW_LIVE failed health check!"
    exit 1
fi

echo "✅ colab-$NEW_LIVE is healthy"
echo ""

# Update Caddyfile to point to new production
echo "Updating Caddy configuration..."

cat > "$CADDY_CONFIG/Caddyfile" << EOF
# Blue-Green Deployment Configuration for Co:Lab Connect
# Active production: colab-$NEW_LIVE
# Generated: $(date)

# Production
colabconnect.app {
    reverse_proxy colab-$NEW_LIVE:3000 {
        header_up Host {host}
        header_up X-Real-IP {remote}
        header_up X-Forwarded-For {remote}
        header_up X-Forwarded-Proto {scheme}
    }
    encode gzip
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options SAMEORIGIN
        Referrer-Policy strict-origin-when-cross-origin
    }
}

# Staging (points to the OLD production, now available for next deploy)
staging.colabconnect.app {
    reverse_proxy colab-$OLD_LIVE:3000 {
        header_up Host {host}
        header_up X-Real-IP {remote}
        header_up X-Forwarded-For {remote}
        header_up X-Forwarded-Proto {scheme}
        fail_duration 30s
    }
    encode gzip
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options SAMEORIGIN
        Referrer-Policy strict-origin-when-cross-origin
    }
}

# Redirect www to non-www
www.colabconnect.app {
    redir https://colabconnect.app{uri} permanent
}
EOF

# Update active color tracker
echo "$NEW_LIVE" > "$CADDY_CONFIG/active_color"

# Restart Caddy (reload doesn't always pick up DNS changes)
echo "Restarting Caddy..."
docker restart n8n-docker-caddy-caddy-1

echo ""
echo "=========================================="
echo "✅ Production promoted successfully!"
echo "=========================================="
echo ""
echo "🌐 Production (colabconnect.app) → colab-$NEW_LIVE"
echo "🧪 Staging (staging.colabconnect.app) → colab-$OLD_LIVE"
echo ""
echo "The old production (colab-$OLD_LIVE) is still running as instant rollback."
echo "To rollback: ./promote.sh (runs again to swap back)"
echo ""
