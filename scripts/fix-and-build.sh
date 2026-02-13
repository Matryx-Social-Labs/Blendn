#!/bin/bash
# Complete fix for EAS Build issues

set -e

echo "🔧 Fixing iOS project for EAS Build..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Clean everything
echo -e "${YELLOW}1. Cleaning old build artifacts...${NC}"
rm -rf ios/build
rm -rf ios/Pods
rm -rf ios/Podfile.lock
rm -rf node_modules
rm -rf package-lock.json

# 2. Fresh npm install
echo -e "${YELLOW}2. Installing npm dependencies...${NC}"
npm install

# 3. Regenerate iOS with expo prebuild
echo -e "${YELLOW}3. Regenerating iOS native code...${NC}"
npx expo prebuild --platform ios --clean

# 4. Install pods
echo -e "${YELLOW}4. Installing CocoaPods...${NC}"
cd ios && pod install && cd ..

# 5. Commit changes (required for EAS)
echo -e "${YELLOW}5. Committing changes to git...${NC}"
git add .
git commit -m "fix: regenerate iOS native files for EAS Build" || echo "Nothing to commit"

echo ""
echo -e "${GREEN}✅ iOS project fixed!${NC}"
echo ""
echo -e "${BLUE}Now run:${NC}"
echo "  eas build --profile development --platform ios"
echo ""
