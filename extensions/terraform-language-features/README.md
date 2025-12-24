# Terraform Language Features

First-class VS Code extension for Terraform and Terragrunt with intelligent variable resolution.

## Features

- **Intelligent Syntax Highlighting**: Comprehensive TextMate grammars for Terraform and Terragrunt
- **Language Server Protocol (LSP)**: Full language intelligence with hover, completion, and go-to-definition
- **Variable Resolution Engine**: Resolves values across files, dependencies, and parent configurations
- **Variable Inspector Panel**: Tree view showing all resolved variables grouped by category
- **Inline Breadcrumbs**: Visual hints showing resolution chains inline in the editor

## Architecture

This extension uses a client-server architecture:

- **Client**: VS Code extension that handles UI components and communicates with the LSP server
- **Server**: LSP server that performs parsing, workspace indexing, and variable resolution

## Development

```bash
# Compile
npm run compile

# Watch mode
npm run watch
```

## License

MIT

