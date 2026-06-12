#!/bin/bash

# Age of Empires RTS - Firebase Deployment Script
# Usage: bash deploy.sh [firebase-token]

set -e

FIREBASE_TOKEN="${1:-}"
PROJECT_ID="vibraaltoai-11f55"
HOSTING_TARGET="rey"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════╗"
echo "║  🎮 Age of Empires RTS - Firebase Deploy      ║"
echo "╚════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if token is provided
if [ -z "$FIREBASE_TOKEN" ]; then
    echo -e "${RED}❌ Error: Firebase token not provided${NC}"
    echo ""
    echo "Usage: bash deploy.sh <firebase-token>"
    echo ""
    echo "To get a Firebase token, run:"
    echo "  ${YELLOW}firebase login:ci --no-localhost${NC}"
    echo ""
    exit 1
fi

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${GREEN}✓ Working directory: $SCRIPT_DIR${NC}"

# Step 1: Check if rey directory exists
if [ ! -d "rey" ]; then
    echo -e "${RED}❌ Error: 'rey' directory not found${NC}"
    exit 1
fi

cd rey

echo ""
echo -e "${YELLOW}📦 Step 1: Cleaning previous build...${NC}"
rm -rf dist/
echo -e "${GREEN}✓ Build cleaned${NC}"

echo ""
echo -e "${YELLOW}📥 Step 2: Installing dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    npm install
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi

echo ""
echo -e "${YELLOW}🔨 Step 3: Building project...${NC}"
npm run build
echo -e "${GREEN}✓ Build successful${NC}"

echo ""
echo -e "${YELLOW}🔍 Step 4: Verifying build output...${NC}"
if [ ! -f "dist/public/index.html" ]; then
    echo -e "${RED}❌ Error: Build output not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Build verified${NC}"

echo ""
echo -e "${YELLOW}🌐 Step 5: Deploying to Firebase...${NC}"
firebase deploy \
    --token "$FIREBASE_TOKEN" \
    --project "$PROJECT_ID" \
    --only "hosting:$HOSTING_TARGET"

echo ""
echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════╗"
echo "║  ✅ Deployment Successful!                    ║"
echo "╚════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "${GREEN}🎮 Game URL:${NC}        https://rey-vibraalto.web.app"
echo -e "${GREEN}📊 Firebase Console:${NC} https://console.firebase.google.com/project/$PROJECT_ID/overview"
echo ""
