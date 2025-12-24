# Debug Guide - Extension Not Working

The extension is activated but features aren't working. Here's how to diagnose:

## Step 1: Check Extension Host Logs

1. Open Output Panel: `View` → `Output` (or `Cmd+Shift+U` / `Ctrl+Shift+U`)
2. Select **"Log (Extension Host)"** from dropdown
3. Look for errors related to `terraform-language-features`
4. Look for stack traces or "Cannot find module" errors

## Step 2: Check LSP Server Logs

1. In Output Panel, select **"Terraform Language Server"**
2. If you see **NO output**, the server isn't starting
3. If you see errors, that's what we need to fix

## Step 3: Test Basic Features

### Test 1: Hover (Main Feature)
1. Create a file: `test.tf`
2. Add this content:
```terraform
locals {
  region = "us-east-1"
}

resource "aws_instance" "test" {
  instance_type = local.region
}
```
3. Hover over `local.region` on line 6
4. **Expected**: Tooltip appears
5. **If nothing happens**: Server isn't providing hover

### Test 2: Auto-completion
1. In `test.tf`, type: `res` and press `Ctrl+Space`
2. **Expected**: Suggestions including `resource`
3. **If nothing**: Completion provider not working

### Test 3: Go to Definition
1. Right-click on `local.region`
2. Select "Go to Definition" (or press `F12`)
3. **Expected**: Jumps to `locals { region = ... }`
4. **If nothing**: Definition provider not working

## Step 4: Manual Server Test

Test if the server can be loaded manually:

```bash
cd extensions/terraform-language-features/server
node -e "const s = require('./out/server.js'); console.log('Server loaded:', s)"
```

If this shows errors, the server has runtime issues.

## Step 5: Check for Missing Dependencies

The server might be missing runtime dependencies:

```bash
cd extensions/terraform-language-features/server
npm list
```

Look for UNMET PEER DEPENDENCIES or missing packages.

## Common Issues

### Issue 1: "Cannot find module"
**Symptom**: Extension Host logs show "Cannot find module '../server'" or similar
**Fix**: Server didn't compile properly, rebuild:
```bash
cd extensions/terraform-language-features
./build.sh
```

### Issue 2: Server starts but no features work
**Symptom**: No hover, no completion, no diagnostics
**Possible causes**:
- Server initialized but didn't register capabilities
- Connection between client and server failed
- Server crashed after initialization

**Debug**: Add console.log to server:
- Edit `server/out/node/serverMain.js`
- Add: `console.log('SERVER STARTING');` at the top
- Reload VS Code
- Check Output → "Terraform Language Server"

### Issue 3: Syntax highlighting works but nothing else
**Symptom**: Keywords are colored, but no intelligent features
**Cause**: TextMate grammar works independently of LSP
**This means**: The LSP server isn't providing features

## Quick Fix: Simplify Server

If the server is too complex and crashing, we can create a minimal version:

1. Edit `server/src/node/serverMain.ts`
2. Add extensive logging
3. Rebuild and test

## Get Detailed Logs

To see what the client is sending to the server:

1. Open Settings (`Cmd+,` / `Ctrl+,`)
2. Search: `terraform.trace.server`
3. Set to: `verbose`
4. Reload VS Code
5. Check Output → "Terraform Language Server"

## Next Steps

Based on what you find:
- If server logs show errors → Fix those errors
- If no server logs at all → Server isn't starting, check Extension Host logs
- If server starts but no features → Check provider registration

Please share:
1. Extension Host logs (errors)
2. Terraform Language Server logs (all output)
3. Results of hover test

