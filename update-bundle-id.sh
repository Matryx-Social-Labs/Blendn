#!/bin/bash
# Script to update Bundle ID for new Apple Developer account

set -e

echo "🔄 Updating Bundle ID to: com.matryxsociallabs.blendn"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Clean iOS build artifacts
echo -e "${YELLOW}🧹 Cleaning iOS build artifacts...${NC}"
rm -rf ios/build
rm -rf ios/Pods
rm -rf ios/Podfile.lock

# Rebuild with Expo
echo -e "${YELLOW}📱 Regenerating iOS project with new Bundle ID...${NC}"
npx expo prebuild --platform ios --clean

# Install pods
echo -e "${YELLOW}📦 Installing CocoaPods...${NC}"
cd ios && pod install && cd ..

echo ""
echo -e "${GREEN}✅ Bundle ID updated successfully!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Register 'com.matryxsociallabs.blendn' in Apple Developer Portal"
echo "   → https://developer.apple.com/account/resources/identifiers/list"
echo ""
echo "2. Open Xcode and update signing:"
echo -e "   ${YELLOW}open ios/blendn.xcworkspace${NC}"
echo "   → Select blendn target"
echo "   → Signing & Capabilities"
echo "   → Select your new Team"
echo ""
echo "3. Update Google OAuth (if using):"
echo "   → You may need new Google OAuth client for the new Bundle ID"
echo ""
echo -e "${GREEN}Ready to build and test!${NC}"
