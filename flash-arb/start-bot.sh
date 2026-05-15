#!/bin/bash
# Start the NotArb flash loan arbitrage bot
# Make sure Jupiter server is running first (bash start-jupiter.sh)

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   FLASH LOAN ARBITRAGE BOT — Starting                    ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Flash loans: ZERO collateral                            ║"
echo "║  Fee: 12.5% of PROFITS only (no profit = no fee)         ║"
echo "║  Gas per attempt: ~\$0.001                               ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

NOTARB_DIR="./notarb"

if [ ! -d "$NOTARB_DIR" ]; then
    echo "ERROR: NotArb not found. Run 'bash setup.sh' first."
    exit 1
fi

if [ ! -f "./bot-config.toml" ]; then
    echo "ERROR: bot-config.toml not found. Run 'bash setup.sh' first."
    exit 1
fi

# Check if simulation mode is enabled
if grep -q 'enabled=true' ./bot-config.toml 2>/dev/null; then
    if grep -A1 '\[simulation_mode\]' ./bot-config.toml | grep -q 'enabled=true'; then
        echo "NOTE: Running in SIMULATION MODE (no real trades)"
        echo "      Edit bot-config.toml → [simulation_mode] → enabled=false for live trading"
        echo ""
    fi
fi

cd "$NOTARB_DIR"

# Start the bot
if [ -f "./notarb" ]; then
    ./notarb --config ../bot-config.toml
elif [ -f "./notarb-jupiter" ]; then
    ./notarb-jupiter --config ../bot-config.toml
else
    echo "NotArb binary not found in $NOTARB_DIR/"
    echo "Download NotArb from: https://download.notarb.org/"
    echo "Extract into the ./notarb/ directory."
fi
