#!/bin/bash
# Quick script to build and test Blendn on your iPhone

set -e

echo "🚀 Building Blendn for your device..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing npm dependencies...${NC}"
    npm install
fi

# Check if pods are installed
if [ ! -d "ios/Pods" ]; then
    echo -e "${YELLOW}📦 Installing CocoaPods dependencies...${NC}"
    cd ios && pod install && cd ..
fi

echo ""
echo -e "${GREEN}✅ Dependencies ready!${NC}"
echo ""
echo -e "${BLUE}Opening Xcode workspace...${NC}"
echo ""
echo "Next steps in Xcode:"
echo "1. Connect your iPhone via USB"
echo "2. Select your iPhone from the device dropdown"
echo "3. Click the Play button (▶) or press Cmd + R"
echo "4. If prompted, trust your developer certificate on your iPhone:"
echo "   Settings → General → VPN & Device Management"
echo ""

# Open Xcode workspace
open ios/blendn.xcworkspace

echo -e "${GREEN}✨ Ready to test!${NC}"
