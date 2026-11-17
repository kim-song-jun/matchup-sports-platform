#!/bin/bash
set -e

echo "=== MatchUp Server Setup ==="

# System update
sudo yum update -y
sudo yum install -y docker git
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/qa/check-git-security.sh"

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install patched Node.js 22 + pnpm
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/configure-nodesource-22.sh"
sudo yum install -y nodejs
node -e 'const [major,minor,patch]=process.versions.node.split(".").map(Number);if(major!==22||minor<23||(minor===23&&patch<5))throw new Error("Node.js >=22.23.5 <23 required (ICTIS SMR261116)")'
sudo npm install -g pnpm@9.15.4

echo "=== Setup Complete ==="
docker --version
docker-compose --version
node --version
pnpm --version
