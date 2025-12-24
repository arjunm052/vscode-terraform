# Testing Guide: Terraform Language Features Extension

## Quick Start: Verify Extension is Working

### 1. Check Extension is Loaded

1. **Open VS Code** (the compiled version you're running)
2. **Open Command Palette** (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows/Linux)
3. Type: `Developer: Show Running Extensions`
4. Look for `terraform-language-features` in the list
5. Check the status - it should show as "Activated" when you open a `.tf` or `.hcl` file

### 2. Test Syntax Highlighting

1. **Create a test file**:
   - Create a new file: `test.tf`
   - VS Code should automatically recognize it as Terraform

2. **Paste this test content**:
```terraform
locals {
  region = "us-east-1"
  instance_type = "t3.medium"
}

resource "aws_instance" "example" {
  ami           = "ami-12345678"
  instance_type = local.instance_type
  availability_zone = "${local.region}a"
}

variable "environment" {
  type = string
  default = "production"
}
```

3. **Verify syntax highlighting**:
   - `resource`, `variable`, `locals` should be highlighted (keywords)
   - `aws_instance`, `example` should be highlighted (resource types/names)
   - `local.instance_type` should be highlighted (variable reference)
   - Strings should be in a different color

### 3. Test Terragrunt Syntax

1. **Create**: `terragrunt.hcl`
2. **Paste this content**:
```hcl
include {
  path = find_in_parent_folders()
}

dependency "vpc" {
  config_path = "../vpc"
}

inputs = {
  vpc_id = dependency.vpc.outputs.vpc_id
  instance_type = local.instance_type
}
```

3. **Verify**:
   - `include`, `dependency`, `inputs` should be highlighted
   - `find_in_parent_folders()` should be highlighted as a function
   - `dependency.vpc.outputs.vpc_id` should be highlighted

### 4. Test Hover Provider

1. **Open** a `.tf` or `.hcl` file with variable references
2. **Hover** your mouse over:
   - `local.instance_type`
   - `dependency.vpc.outputs.vpc_id`
   - `var.environment`
3. **Expected**: You should see a hover tooltip showing:
   - The resolved value (if resolvable)
   - The source file
   - The resolution chain

### 5. Access Variable Inspector Panel

1. **Open the Explorer sidebar** (left panel)
2. Look for **"Terraform Variables"** section at the bottom
3. If not visible:
   - Right-click in Explorer sidebar
   - Look for "Terraform Variables" in the context menu
   - Or use Command Palette: `View: Show Terraform Variables`
4. **Expand** categories:
   - Locals
   - Dependencies
   - Includes
   - Env Vars
5. **Click refresh icon** (🔄) in the panel header to refresh

### 6. Test Inline Breadcrumbs

1. **Open** a Terragrunt file with variable references
2. **Look** at the end of variable references (e.g., after `local.instance_type`)
3. **Expected**: You should see inline hints like:
   ```
   local.instance_type → locals.hcl → "t3.medium"
   ```

### 7. Check LSP Server Status

1. **Open Output Panel**: `View` → `Output` (or `Cmd+Shift+U` / `Ctrl+Shift+U`)
2. **Select**: "Terraform Language Server" from the dropdown
3. **Look for**:
   - Server initialization messages
   - Any error messages
   - Document parsing messages

### 8. Test Commands

1. **Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Type: `Terraform: Refresh Variables`
   - Should refresh the variable inspector panel
3. Type: `Terraform: Show Resolution Chain`
   - Should show resolution chain for variable at cursor

### 9. Test Auto-completion

1. **Open** a `.tf` file
2. **Type**: `local.`
3. **Expected**: You should see suggestions for available local variables
4. **Type**: `resource`
5. **Expected**: You should see snippet suggestions for resource blocks

### 10. Test Go to Definition

1. **Right-click** on a variable reference (e.g., `local.instance_type`)
2. **Select**: "Go to Definition" (or `F12`)
3. **Expected**: Should jump to where the variable is defined

## Troubleshooting

### Extension Not Activating?

1. **Check Output Logs**:
   - `View` → `Output`
   - Select "Log (Extension Host)"
   - Look for errors related to `terraform-language-features`

2. **Check LSP Server Logs**:
   - Output panel → "Terraform Language Server"
   - Look for initialization errors

3. **Verify Files Compiled**:
   - Check that `client/out/node/extension.js` exists
   - Check that `server/out/node/serverMain.js` exists

### Syntax Highlighting Not Working?

1. **Check Language Mode**:
   - Bottom right corner of VS Code
   - Should show "Terraform" or "Terragrunt"
   - If not, click and select manually

2. **Verify Grammar Files**:
   - Check `syntaxes/terraform.tmLanguage.json` exists
   - Check `syntaxes/terragrunt.tmLanguage.json` exists

### Hover Not Working?

1. **Check LSP Server**:
   - Output panel → "Terraform Language Server"
   - Should show no errors

2. **Verify Document is Parsed**:
   - Check server logs for parsing messages
   - Try saving the file to trigger re-parsing

### Variable Inspector Empty?

1. **Refresh**: Click the refresh button in the panel
2. **Check Active File**: Panel shows variables for the active file
3. **Verify Resolution**: Check if variables can be resolved (hover over them)

## Expected Behavior Summary

✅ **Working Correctly**:
- Syntax highlighting for Terraform/Terragrunt keywords
- Hover shows resolved values and resolution chains
- Variable inspector panel shows categorized variables
- Inline breadcrumbs show resolution hints
- Auto-completion suggests variables and keywords
- Go to definition jumps to variable definitions

❌ **Not Working**:
- No syntax highlighting → Check grammar files and language mode
- No hover → Check LSP server logs
- Empty variable panel → Check resolution engine logs
- No auto-completion → Check LSP server initialization

## Debug Mode

To debug the extension:

1. **Set breakpoints** in:
   - `client/src/node/extension.ts` (client side)
   - `server/src/server.ts` (server side)

2. **Launch Debug**:
   - `F5` to start debugging
   - Opens a new VS Code window with extension loaded

3. **Check Debug Console**:
   - View → Debug Console
   - Shows console.log output from extension

## Next Steps

Once basic functionality is verified:
1. Test with real Terraform/Terragrunt projects
2. Test cross-file resolution
3. Test with monorepo structures
4. Test performance with large workspaces

