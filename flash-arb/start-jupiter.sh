#!/bin/bash
# Start the self-hosted Jupiter API server
# This must be running before you start the arb bot

echo "Starting Jupiter API server..."
echo "This may take 1-3 minutes on first launch (downloading DEX data)."
echo ""

NOTARB_DIR="./notarb"

if [ ! -d "$NOTARB_DIR" ]; then
    echo "ERROR: NotArb not found. Run 'bash setup.sh' first."
    exit 1
fi

if [ ! -f "./jupiter-config.toml" ]; then
    echo "ERROR: jupiter-config.toml not found. Run 'bash setup.sh' first."
    exit 1
fi

cd "$NOTARB_DIR"

# Check if Jupiter server binary exists
if [ -f "./jupiter-server" ]; then
    ./jupiter-server --config ../jupiter-config.toml
elif [ -f "./start-jupiter.sh" ]; then
    bash ./start-jupiter.sh
else
    echo "Jupiter server binary not found in $NOTARB_DIR/"
    echo "Download NotArb from: https://download.notarb.org/"
    echo "Extract into the ./notarb/ directory."
fi
