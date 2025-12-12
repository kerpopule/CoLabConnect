#!/bin/bash
# Check current deployment status
set -e

CADDY_CONFIG="/opt/n8n-docker-caddy/caddy_config"

echo "=== Deployment Status ==="
echo ""

# Get active color
ACTIVE=$(cat "$CADDY_CONFIG/active_color" 2>/dev/null || echo "unknown")
if [ "$ACTIVE" = "blue" ]; then
    STAGING="green"
else
    STAGING="blue"
fi

echo "Production: colab-$ACTIVE"
echo "Staging: colab-$STAGING"
echo ""

# Check container status
echo "Container Status:"
echo "-----------------"

for COLOR in blue green; do
    if docker ps | grep -q "colab-$COLOR"; then
        STATUS="🟢 Running"
        # Get uptime
        UPTIME=$(docker ps --format "{{.Status}}" --filter "name=colab-$COLOR")
    elif docker ps -a | grep -q "colab-$COLOR"; then
        STATUS="🔴 Stopped"
        UPTIME="N/A"
    else
        STATUS="⚪ Not created"
        UPTIME="N/A"
    fi

    if [ "$COLOR" = "$ACTIVE" ]; then
        ROLE="[PRODUCTION]"
    else
        ROLE="[STAGING]"
    fi

    echo "  colab-$COLOR $ROLE: $STATUS ($UPTIME)"
done

echo ""
echo "URLs:"
echo "  Production: https://colabconnect.app"
echo "  Staging:    https://staging.colabconnect.app"
echo ""

# Quick health checks
echo "Health Checks:"
echo "--------------"
for COLOR in blue green; do
    if docker ps | grep -q "colab-$COLOR"; then
        HEALTH=$(docker exec colab-$COLOR wget -q -O /dev/null http://localhost:3000 && echo "✅ Healthy" || echo "❌ Unhealthy")
        echo "  colab-$COLOR: $HEALTH"
    fi
done
echo ""
