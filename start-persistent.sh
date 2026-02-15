#!/bin/bash
# Start dashboard server in persistent mode

LOG_FILE="/Users/lume/clawd/agent-dashboard/server.log"
PID_FILE="/Users/lume/clawd/agent-dashboard/server.pid"

# Kill existing process
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    kill "$OLD_PID" 2>/dev/null || true
    rm "$PID_FILE"
fi

cd /Users/lume/clawd/agent-dashboard

echo "[$(date)] Starting Vite server..." >> "$LOG_FILE"
nohup npm run dev -- --host 0.0.0.0 --port 5173 >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

sleep 5

# Verify it's running
if curl -s http://localhost:5173 > /dev/null; then
    echo "[$(date)] Server running on http://localhost:5173" >> "$LOG_FILE"
    echo "OK - Server running"
else
    echo "[$(date)] Failed to start" >> "$LOG_FILE"
    echo "ERROR - Failed to start"
    exit 1
fi