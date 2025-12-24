# Quick Test Checklist

## Step 1: Verify Extension is Loaded (30 seconds)

1. Open VS Code
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
3. Type: `Developer: Show Running Extensions`
4. ✅ Look for `terraform-language-features` - should show "Activated" when you open a `.tf` file

## Step 2: Test Syntax Highlighting (1 minute)

1. Create a new file: `test.tf`
2. Paste this:
```terraform
resource "aws_instance" "test" {
  instance_type = "t3.medium"
}
```
3. ✅ Keywords (`resource`) should be colored differently than strings

## Step 3: Test Hover (1 minute)

1. In `test.tf`, add:
```terraform
locals {
  region = "us-east-1"
}

resource "aws_instance" "test" {
  instance_type = local.region
}
```
2. Hover over `local.region`
3. ✅ Should show a tooltip (may show "unknown" initially - that's OK, means extension is working)

## Step 4: Check Output Logs (30 seconds)

1. Press `Cmd+Shift+U` (Mac) or `Ctrl+Shift+U` (Windows/Linux) to open Output panel
2. Select "Terraform Language Server" from dropdown
3. ✅ Should see initialization messages (no errors)

## Step 5: Access Variable Panel (30 seconds)

1. Look at left sidebar (Explorer)
2. Scroll down - should see "Terraform Variables" section
3. ✅ If visible, extension UI is working!

## Troubleshooting

**Extension not showing?**
- Check `View` → `Output` → "Log (Extension Host)" for errors
- Verify files compiled: check `client/out/node/extension.js` exists

**No syntax highlighting?**
- Bottom right corner: click language mode, select "Terraform"

**Hover not working?**
- Check Output → "Terraform Language Server" for errors
- Try saving the file

**Variable panel not showing?**
- Command Palette → `View: Show Terraform Variables`
- Or check if it's collapsed in Explorer sidebar

