#!/bin/bash
set -e

echo "=== MatchUp Server Setup ==="

# System update
sudo yum update -y
sudo yum install -y docker git

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Node.js 20 + pnpm
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
sudo npm install -g pnpm@9

echo "=== Setup Complete ==="
docker --version
docker-compose --version
node --version
pnpm --version
