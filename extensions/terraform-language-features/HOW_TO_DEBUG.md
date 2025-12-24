# How to Debug: Extension Activated But Features Not Working

## Issue
- Extension shows as "Activated"
- Syntax highlighting works
- BUT: Hover, completion, and other LSP features don't work

## Solution: Check the Logs

### Step 1: Reload VS Code
First, reload to pick up the updated server with logging:

1. **Press:** `Cmd+R` (Mac) or `Ctrl+R` (Windows/Linux)
2. **Or:** Command Palette → `Developer: Reload Window`

### Step 2: Open a Terraform File
1. Create or open any `.tf` file
2. Add some basic Terraform code:
```terraform
locals {
  region = "us-east-1"
}
```

### Step 3: Check LSP Server Logs
1. **Open Output Panel:** `View` → `Output` or `Cmd+Shift+U` / `Ctrl+Shift+U`
2. **Select:** "Terraform Language Server" from the dropdown (top right)
3. **Look for these log messages:**
   ```
   [Terraform LSP] Server module loaded
   [Terraform LSP] Connection created
   [Terraform LSP] Starting Terraform Language Server...
   [Server] Constructor called
   [Server] TextDocuments created
   [Server] Creating WorkspaceManager...
   [Server] Creating HCLParser...
   [Server] Creating ResolutionEngine...
   [Server] Creating HoverProvider...
   [Terraform LSP] Server instance created
   [Terraform LSP] Server started and listening
   ```

### What the Logs Tell You

**✅ If you see all the log messages:**
- Server is starting correctly
- Look further down for initialization messages
- The issue might be in provider registration

**❌ If you see NO logs:**
- Server isn't starting at all
- Check Extension Host logs (see Step 4)

**⚠️ If logs stop partway through:**
- Server is crashing during initialization
- The last log message shows where it failed
- Example: If you see "Creating ResolutionEngine..." but no "Creating HoverProvider", the ResolutionEngine is crashing

### Step 4: Check Extension Host Logs
1. In Output Panel, select **"Log (Extension Host)"**
2. Search for `terraform` or errors
3. Look for:
   - "Cannot find module"
   - Stack traces
   - "Extension activation failed"

### Step 5: Test Hover Manually
1. In your `.tf` file, add:
```terraform
locals {
  instance_type = "t3.medium"
}

resource "aws_instance" "test" {
  instance_type = local.instance_type
}
```
2. **Hover** your mouse over `local.instance_type` on the last line
3. **Expected:** Tooltip appears (may show "unknown" - that's OK!)
4. **If nothing:** Server isn't providing hover

### Step 6: Enable Verbose Logging
1. Open Settings: `Cmd+,` / `Ctrl+,`
2. Search: `terraform.trace.server`
3. Change to: **`verbose`**
4. Reload VS Code
5. Check "Terraform Language Server" output again - you'll see much more detail

## Common Problems & Solutions

### Problem 1: No Server Logs At All
**Cause:** Server isn't starting
**Check:** Extension Host logs for errors
**Fix:** Look for "Cannot find module" errors - might need to rebuild

### Problem 2: Server Logs Stop at "Creating ResolutionEngine"
**Cause:** ResolutionEngine constructor is crashing
**Why:** Probably a runtime error in resolver code
**Fix:** Check if all resolver files compiled

### Problem 3: Server Starts But No Hover
**Cause:** Hover provider not registered or not working
**Check:** Look for "onHover registered" in logs
**Fix:** Server might need to register capabilities in onInitialize

### Problem 4: "Cannot find module '../server'"
**Cause:** Server.js didn't compile
**Fix:** Run build script again:
```bash
cd extensions/terraform-language-features
./build.sh
```

## What to Share for Help

If you need help, please provide:

1. **Full LSP Server logs:**
   - Output → "Terraform Language Server"
   - Copy all text

2. **Extension Host errors:**
   - Output → "Log (Extension Host)"
   - Search for "terraform" and copy any errors

3. **Test results:**
   - Did hover work? Yes/No
   - Did completion work? Yes/No
   - Any error messages shown in VS Code?

## Next Steps

Based on the logs:
- **If server starts successfully:** The providers might not be registering - check provider code
- **If server crashes:** Look at the last log message to see where it failed
- **If no logs at all:** Client-server connection might not be working

The logging I added will show exactly where the server is failing!

