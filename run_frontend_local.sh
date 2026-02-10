#!/bin/bash
cd apps/dashboard

# Make sure dependencies are installed
if [ ! -d "node_modules" ]; then
  npm install
fi

# Run frontend dev server
npm run dev
