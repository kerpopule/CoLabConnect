#!/bin/bash
# One-time setup for blue-green deployment
# This script is SAFE - it only renames the container and updates the reference
set -e

CADDY_CONFIG="/opt/n8n-docker-caddy/caddy_config"

echo "=== Blue-Green Deployment Setup ==="
echo ""
echo "This will:"
echo "  1. Rename your current 'colab-connect' container to 'colab-blue'"
echo "  2. Update Caddyfile to reference 'colab-blue'"
echo "  3. Set up tracking files for blue-green switching"
echo ""
echo "Your production site will remain running throughout."
echo ""
read -p "Press Enter to continue or Ctrl+C to abort..."

# Step 1: Check current container exists
if ! docker ps | grep -q "colab-connect"; then
    if docker ps | grep -q "colab-blue"; then
        echo "✅ colab-blue already exists - setup may have already been run"
        echo "   Skipping container rename..."
    else
        echo "❌ Error: No colab-connect or colab-blue container found!"
        exit 1
    fi
else
    # Rename container
    echo "Renaming colab-connect → colab-blue..."
    docker rename colab-connect colab-blue
    echo "✅ Container renamed"
fi

# Step 2: Backup and update Caddyfile
echo ""
echo "Backing up Caddyfile..."
cp "$CADDY_CONFIG/Caddyfile" "$CADDY_CONFIG/Caddyfile.backup.$(date +%Y%m%d_%H%M%S)"

echo "Updating Caddyfile..."
# Just replace colab-connect with colab-blue in the existing file
sed -i 's/colab-connect:3000/colab-blue:3000/g' "$CADDY_CONFIG/Caddyfile"

# Add staging block if it doesn't exist
if ! grep -q "staging.colabconnect.app" "$CADDY_CONFIG/Caddyfile"; then
    echo ""
    echo "Adding staging subdomain configuration..."
    cat >> "$CADDY_CONFIG/Caddyfile" << 'EOF'

# Staging environment for testing before production
staging.colabconnect.app {
    reverse_proxy colab-green:3000 {
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
EOF
fi

echo "✅ Caddyfile updated"

# Step 3: Create tracking file
echo ""
echo "Creating deployment tracking file..."
echo "blue" > "$CADDY_CONFIG/active_color"
echo "✅ Tracking file created"

# Step 4: Reload Caddy
echo ""
echo "Reloading Caddy..."
docker exec n8n-docker-caddy-caddy-1 caddy reload --config /etc/caddy/Caddyfile

# Step 5: Verify
echo ""
echo "Verifying production is still accessible..."
sleep 2
if curl -sf https://colabconnect.app > /dev/null; then
    echo "✅ Production site is responding"
else
    echo "⚠️  Warning: Could not verify production site"
    echo "   Check: curl -I https://colabconnect.app"
fi

echo ""
echo "=========================================="
echo "✅ Setup Complete!"
echo "=========================================="
echo ""
echo "Current state:"
echo "  🟢 Production (colabconnect.app) → colab-blue"
echo "  ⚪ Staging (staging.colabconnect.app) → colab-green (not yet created)"
echo ""
echo "IMPORTANT: Add DNS record for staging.colabconnect.app"
echo "  Type: A"
echo "  Name: staging"
echo "  Value: 104.131.176.167"
echo ""
echo "Next steps:"
echo "  1. Add the DNS record above"
echo "  2. Run: ./deploy.sh"
echo "  3. Test at: https://staging.colabconnect.app"
echo "  4. When ready: ./promote.sh"
echo ""
