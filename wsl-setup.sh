#!/bin/bash
echo "========== Installing development environment in WSL =========="

# Update system
echo "Updating Ubuntu package manager..."
sudo apt update
sudo apt upgrade -y

# Install basic tools
echo "Installing basic tools..."
sudo apt install -y curl wget git build-essential

# Install Node.js (using NodeSource official source)
echo "Installing Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

# Install yarn
echo "Installing Yarn..."
npm install -g yarn

# Install global development tools
echo "Installing global development tools..."
npm install -g hardhat

echo "========== WSL development environment installation complete =========="
