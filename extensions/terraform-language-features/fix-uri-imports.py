#!/usr/bin/env python3
import re
import glob
import os

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content

    # Add path import if URI is imported
    if 'import { URI } from \'vscode-uri\'' in content and 'import * as path from \'path\'' not in content:
        content = content.replace(
            'import { URI } from \'vscode-uri\';',
            'import { URI } from \'vscode-uri\';\nimport * as path from \'path\';'
        )

    # Replace path.join(URI, x) -> path.join(URI.fsPath, x)
    content = re.sub(
        r'path\.join\((URI\.(?:parse|file)\([^)]+\)),',
        lambda m: f"path.join({m.group(1)}.fsPath,",
        content
    )

    # Replace any remaining URI.joinPath patterns
    content = re.sub(
        r'URI\.joinPath\([^)]+\)',
        'URI.file("FIXME")',
        content
    )

    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed {filepath}")

for pattern in ['server/src/**/*.ts']:
    for filepath in glob.glob(pattern, recursive=True):
        if os.path.isfile(filepath):
            fix_file(filepath)

print("Done!")

