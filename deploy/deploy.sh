#!/bin/bash
# Deploy to staging environment (does NOT affect production)
set -e

CADDY_CONFIG="/opt/n8n-docker-caddy/caddy_config"
PROJECT_DIR="/root/CoLabConnect"

# Determine current production color
if [ -f "$CADDY_CONFIG/active_color" ]; then
    LIVE=$(cat "$CADDY_CONFIG/active_color")
else
    LIVE="blue"
fi

# Staging is always the opposite of live
if [ "$LIVE" = "blue" ]; then
    STAGING="green"
else
    STAGING="blue"
fi

echo "=== Deploying to Staging ==="
echo ""
echo "📍 Current production: colab-$LIVE"
echo "🚀 Deploying to staging: colab-$STAGING"
echo ""

cd "$PROJECT_DIR"

# Pull latest code
echo "Pulling latest code..."
git pull

# Load staging environment variables (isolated Supabase database)
echo "Loading staging environment..."
source .env.staging

# Build new image
echo ""
echo "Building Docker image..."
docker build \
  --build-arg VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
  --build-arg VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
  --build-arg VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY \
  -t colab-connect:$STAGING .

# Stop old staging container if exists
echo ""
echo "Replacing staging container..."
docker stop colab-$STAGING 2>/dev/null || true
docker rm colab-$STAGING 2>/dev/null || true

# Start new staging container
docker run -d \
  --name colab-$STAGING \
  --network n8n-docker-caddy_default \
  --restart unless-stopped \
  --env-file .env \
  colab-connect:$STAGING

# Wait for container to start
echo ""
echo "Waiting for container to start..."
sleep 5

# Health check (install curl first as wget doesn't work reliably in alpine)
echo "Running health check..."
docker exec colab-$STAGING sh -c 'apk add --no-cache curl >/dev/null 2>&1' 2>/dev/null || true
HEALTH_CHECK=$(docker exec colab-$STAGING curl -sf http://localhost:3000 >/dev/null && echo "ok" || echo "fail")

if [ "$HEALTH_CHECK" = "ok" ]; then
    echo ""
    echo "=========================================="
    echo "✅ Staging deployed successfully!"
    echo "=========================================="
    echo ""
    echo "🔗 Test at: https://staging.colabconnect.app"
    echo ""
    echo "Once you've verified everything works:"
    echo "  ./promote.sh    # Make staging the new production"
    echo ""
else
    echo ""
    echo "❌ Health check failed!"
    echo "Check logs: docker logs colab-$STAGING"
    exit 1
fi
