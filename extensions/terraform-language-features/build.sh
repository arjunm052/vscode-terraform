#!/bin/bash
# Quick build script for Terraform Language Features extension

set -e

echo "Building Terraform Language Features Extension..."

# Compile client
echo "Compiling client..."
cd client
../../../node_modules/.bin/tsc -p ./tsconfig.json --skipLibCheck --noEmitOnError false
cd ..

# Compile server
echo "Compiling server..."
cd server
../../../node_modules/.bin/tsc -p ./tsconfig.json --skipLibCheck --noEmitOnError false
cd ..

echo "Build complete!"
echo "Client output: client/out/"
echo "Server output: server/out/"
ls -la client/out/node/
ls -la server/out/node/

