#!/bin/bash
# ============================================================
# NotArb Flash Loan Arbitrage — One-Command Setup
# ============================================================
#
# This script:
# 1. Downloads NotArb (free Solana arb bot with flash loans)
# 2. Downloads Jupiter self-hosted API server
# 3. Generates a Solana wallet (if needed)
# 4. Configures everything for flash loan arbitrage
#
# Cost: $0 to set up. Only SOL gas fees per arb attempt (~$0.001).
# Flash loan fee: 12.5% of PROFITS only. No profit = no fee.
#
# Usage: bash setup.sh
# ============================================================

set -e

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   SOLANA FLASH LOAN ARBITRAGE — Setup                    ║"
echo "║   Powered by NotArb (free) + Helius RPC (free)           ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Detect OS
OS="$(uname -s)"
ARCH="$(uname -m)"

if [[ "$OS" != "Linux" && "$OS" != "Darwin" ]]; then
    echo "ERROR: NotArb only runs on Linux (x64) or macOS (x64/arm64)."
    echo "Windows users: use WSL2 (Windows Subsystem for Linux)."
    exit 1
fi

echo "Detected: $OS $ARCH"
echo ""

# Step 1: Download NotArb
echo "STEP 1: Downloading NotArb..."
NOTARB_DIR="./notarb"
mkdir -p "$NOTARB_DIR"

if [ ! -f "$NOTARB_DIR/notarb" ] && [ ! -f "$NOTARB_DIR/notarb-jupiter" ]; then
    echo "  Downloading from https://download.notarb.org/ ..."
    echo "  NOTE: You can also download manually from https://github.com/NotArb/Jupiter/releases"
    echo ""
    echo "  Visit https://download.notarb.org/ and download the latest release for your OS."
    echo "  Extract into the ./notarb/ directory."
    echo ""
    echo "  For Linux x64:"
    echo "    curl -L https://download.notarb.org/linux-x64 -o notarb-linux.tar.gz"
    echo "    tar xzf notarb-linux.tar.gz -C ./notarb/"
    echo ""
    echo "  For macOS:"
    echo "    curl -L https://download.notarb.org/darwin -o notarb-mac.tar.gz"
    echo "    tar xzf notarb-mac.tar.gz -C ./notarb/"
    echo ""
else
    echo "  NotArb already downloaded."
fi

# Step 2: Generate wallet if needed
echo ""
echo "STEP 2: Wallet Setup"

KEYPAIR_FILE="./wallet/fee-payer.json"
mkdir -p ./wallet

if [ -f "$KEYPAIR_FILE" ]; then
    echo "  Wallet already exists at $KEYPAIR_FILE"
else
    if command -v solana-keygen &> /dev/null; then
        echo "  Generating new Solana wallet..."
        solana-keygen new --outfile "$KEYPAIR_FILE" --no-bip39-passphrase --force
        echo ""
        echo "  NEW WALLET CREATED: $KEYPAIR_FILE"
        echo "  IMPORTANT: Back up this file securely!"
    else
        echo "  solana-keygen not found. Install Solana CLI or create a wallet manually."
        echo "  Install: sh -c \"\$(curl -sSfL https://release.anza.xyz/stable/install)\""
        echo "  Then run: solana-keygen new --outfile $KEYPAIR_FILE --no-bip39-passphrase"
    fi
fi

# Step 3: Copy configs
echo ""
echo "STEP 3: Configuration"

if [ ! -f "./bot-config.toml" ]; then
    if [ -f "./bot-config.example.toml" ]; then
        cp ./bot-config.example.toml ./bot-config.toml
        echo "  Created bot-config.toml from template."
        echo "  Edit bot-config.toml to add your Helius API key."
    fi
fi

if [ ! -f "./jupiter-config.toml" ]; then
    if [ -f "./jupiter-config.example.toml" ]; then
        cp ./jupiter-config.example.toml ./jupiter-config.toml
        echo "  Created jupiter-config.toml from template."
    fi
fi

# Step 4: Instructions
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   SETUP COMPLETE — Next Steps                            ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  1. Get a FREE Helius API key:                           ║"
echo "║     https://dashboard.helius.dev                         ║"
echo "║                                                          ║"
echo "║  2. Edit bot-config.toml:                                ║"
echo "║     - Set your Helius RPC URL                            ║"
echo "║     - Set keypair_path to your wallet                    ║"
echo "║     - Set acknowledge_terms_of_service=true              ║"
echo "║                                                          ║"
echo "║  3. Fund your wallet with ANY amount of SOL:             ║"
echo "║     Even \$0.10 covers ~20,000 arb attempts              ║"
echo "║                                                          ║"
echo "║  4. Start Jupiter server:                                ║"
echo "║     bash start-jupiter.sh                                ║"
echo "║                                                          ║"
echo "║  5. Start the arb bot:                                   ║"
echo "║     bash start-bot.sh                                    ║"
echo "║                                                          ║"
echo "║  COSTS:                                                  ║"
echo "║  - NotArb: FREE (12.5% of profits only)                 ║"
echo "║  - Helius RPC: FREE (1M credits/month)                  ║"
echo "║  - Flash loans: ZERO collateral                          ║"
echo "║  - Gas per attempt: ~\$0.001                             ║"
echo "║  - If no profit: you pay NOTHING                         ║"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
