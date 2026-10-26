#!/bin/bash
# Double-click this file in Finder to start the Brain food helper.
# It simply moves into this folder and runs the server. Close the window
# (or press Ctrl+C) to stop it.
cd "$(dirname "$0")" || exit 1
echo "Starting the Brain food helper..."
node server.js
