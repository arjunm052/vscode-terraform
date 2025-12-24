#!/bin/bash
# Fix all URI-related TypeScript issues

cd server/src

# Replace path.join(URI.parse(...), with path.join(URI.parse(...).fsPath,
find . -name "*.ts" -exec sed -i '' 's/path\.join(URI\.parse(\([^)]*\)),/path.join(URI.parse(\1).fsPath,/g' {} \;
find . -name "*.ts" -exec sed -i '' 's/path\.join(URI\.file(\([^)]*\)),/path.join(URI.file(\1).fsPath,/g' {} \;

echo "Fixed URI issues"

