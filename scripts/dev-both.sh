#!/bin/bash

# Start both development servers simultaneously
echo "🚀 Starting Knowledge Base in development mode..."
echo ""

# Check if tmux is installed for split terminals
if command -v tmux &> /dev/null; then
    echo "📱 Using tmux for split terminal view..."
    
    # Create new tmux session
    tmux new-session -d -s knowledgebase
    
    # Split window vertically
    tmux split-window -h
    
    # Run backend in left pane
    tmux send-keys -t knowledgebase:0.0 'cd scripts && ./dev-backend.sh' C-m
    
    # Run frontend in right pane  
    tmux send-keys -t knowledgebase:0.1 'cd scripts && ./dev-frontend.sh' C-m
    
    # Attach to session
    tmux attach-session -t knowledgebase
    
else
    echo "📝 tmux not found. Starting backend first, then frontend in new terminal..."
    echo "   After backend starts, open a new terminal and run: ./scripts/dev-frontend.sh"
    echo ""
    ./scripts/dev-backend.sh
fi
