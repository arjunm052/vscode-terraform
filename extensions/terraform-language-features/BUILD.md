# Building the Terraform Language Features Extension

## Quick Build (Recommended)

Use the provided build script:

```bash
cd extensions/terraform-language-features
bash build.sh
```

This will compile both the client and server TypeScript files.

## Using Gulp (VS Code Build System)

The extension is now registered in the VS Code build system. You can build it using:

```bash
# From the repository root
npm run compile

# Or specifically for this extension
npx gulp compile-extension:terraform-language-features-client compile-extension:terraform-language-features-server
```

## Watch Mode (Development)

For development, you can use watch mode:

```bash
# From the repository root
npm run watch

# Or specifically for this extension
npx gulp watch-extension:terraform-language-features-client watch-extension:terraform-language-features-server
```

## Troubleshooting

### Error: "Cannot find module terraform-language-features/client/out/node/extension"

This error occurs when the extension hasn't been compiled. Make sure to:

1. Run the build script: `bash build.sh`
2. Or use gulp: `npx gulp compile-extension:terraform-language-features-client compile-extension:terraform-language-features-server`
3. Verify the file exists: `ls -la client/out/node/extension.js`

### File Structure After Build

After building, you should have:

```
terraform-language-features/
├── client/
│   └── out/
│       ├── node/
│       │   └── extension.js
│       └── browser/
│           └── extension.js
└── server/
    └── out/
        └── node/
            └── serverMain.js
```

## Verification

After building, verify the extension loads correctly:

1. Open VS Code
2. Check the Output panel → "Terraform LSP" channel
3. You should see: `[Terraform LSP] Server started and listening`

