# Terragrunt Multi-Level Resolution Guide

## ✅ Enhanced Features

The extension now supports **multi-level Terragrunt resolution**:

### 1. **Parent Folder Traversal** ✅
- Searches `locals.hcl` files in parent directories
- Searches `terragrunt.hcl` files in parent directories (for locals blocks)
- Traverses up to workspace root (max 20 levels)
- Automatically reads files from disk if not in workspace index

### 2. **Include Block Resolution** ✅
- Resolves `include.*` references
- Finds parent `terragrunt.hcl` files using `find_in_parent_folders()` logic
- Supports explicit paths in include blocks
- Recursively resolves nested includes

### 3. **Dependency Block Resolution** ✅
- Resolves `dependency.<name>.outputs.<output>`
- Finds dependency blocks in current file
- Resolves `config_path` to absolute paths
- Loads outputs from Terraform state (mocked for now)

## How It Works

### Locals Resolution Order

1. **Current file** - Checks for `locals {}` block
2. **Same directory** - Checks for `locals.hcl` file
3. **Parent directories** - Traverses up looking for:
   - `locals.hcl` files
   - `terragrunt.hcl` files (checks for locals blocks)
4. **Stops at workspace root** - Won't go beyond repo boundaries

### Include Resolution

When resolving `include.inputs.region`:

1. Finds `include {}` block in current file
2. Resolves parent path (from `path` attribute or `find_in_parent_folders()`)
3. Loads parent `terragrunt.hcl` file
4. Recursively resolves `inputs.region` in parent context
5. Can chain multiple includes (grandparent, etc.)

### Dependency Resolution

When resolving `dependency.vpc.outputs.vpc_id`:

1. Finds `dependency "vpc" {}` block
2. Extracts `config_path` attribute
3. Resolves to absolute path
4. Loads Terraform state outputs (currently mocked)
5. Returns the output value

## File Reading

The extension now **reads files from disk** when they're not open in VS Code:

- Uses Node.js `fs` module
- Caches parsed ASTs in workspace index
- Handles missing files gracefully
- Supports both open and closed files

## Example Terragrunt Structure

```
repo-root/
├── terragrunt.hcl          ← Root config
│   └── locals { region = "us-east-1" }
├── environments/
│   └── prod/
│       └── terragrunt.hcl  ← Includes root
│           └── locals { env = "production" }
│       └── vpc/
│           └── terragrunt.hcl  ← Includes prod
│               └── inputs { vpc_id = dependency.vpc.outputs.id }
│               └── dependency "vpc" { config_path = "../vpc-module" }
```

### Resolution Examples

**In `vpc/terragrunt.hcl`:**
- `local.region` → Found in `repo-root/terragrunt.hcl` ✅
- `local.env` → Found in `environments/prod/terragrunt.hcl` ✅
- `include.inputs.region` → Resolves through include chain ✅
- `dependency.vpc.outputs.id` → Resolves from dependency block ✅

## Testing

1. **Create a multi-level Terragrunt structure**
2. **Open a file deep in the hierarchy**
3. **Hover over variables** - Should resolve through parent chain
4. **Check logs** - Will show resolution chain

## Logging

The extension logs detailed resolution chains:

```
[LocalsResolver] Searching parent directories for: region
[LocalsResolver] Found file in parent: file:///.../repo-root/terragrunt.hcl
[LocalsResolver] Found locals block!
[LocalsResolver] Added local: region = us-east-1
```

## Limitations & Future Enhancements

**Current:**
- ✅ Multi-level parent traversal
- ✅ Include block resolution
- ✅ Dependency block resolution
- ✅ File reading from disk
- ⚠️ Terraform state is mocked (needs real state loading)

**Future:**
- Real Terraform state file parsing
- `terraform show -json` integration
- Environment variable resolution (`local.env_vars.*`)
- Function resolution (`find_in_parent_folders()`, etc.)
- Better error messages for circular dependencies

## Troubleshooting

**If resolution doesn't work:**

1. Check logs for file paths
2. Verify files exist in parent directories
3. Check workspace root is set correctly
4. Ensure file permissions allow reading

**Common issues:**

- **"No AST found"** → File not parsed yet, will be read from disk
- **"File does not exist"** → Check path is correct
- **"Not found in parent"** → May have reached workspace root

