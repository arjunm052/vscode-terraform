/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	Hover,
	Definition,
	Location,
	ReferenceParams,
	WorkspaceFolder
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { WorkspaceManager } from './workspace/workspaceManager';
import { HCLParser } from './parser/hclParser';
import { ResolutionEngine } from './resolver/resolutionEngine';
import { HoverProvider } from './providers/hoverProvider';
import { CompletionProvider } from './providers/completionProvider';
import { DefinitionProvider } from './providers/definitionProvider';
import { ReferencesProvider } from './providers/referencesProvider';
import { DiagnosticsProvider } from './providers/diagnosticsProvider';
import { IncludeService } from './workspace/includeService';
import { ReadTerragruntConfigService } from './workspace/readTerragruntConfigService';
import { ValueExtractor } from './workspace/valueExtractor';
import { IncludeCache } from './workspace/includeCache';
import { FileReader } from './utils/fileReader';

export class Server {
	private connection: ReturnType<typeof createConnection>;
	private documents: TextDocuments<TextDocument>;
	private workspaceManager: WorkspaceManager;
	private parser: HCLParser;
	private resolutionEngine: ResolutionEngine;
	private hoverProvider: HoverProvider;
	private completionProvider: CompletionProvider;
	private definitionProvider: DefinitionProvider;
	private referencesProvider: ReferencesProvider;
	private diagnosticsProvider: DiagnosticsProvider;
	private hasConfigurationCapability = false;
	private hasWorkspaceFolderCapability = false;

	constructor(connection: ReturnType<typeof createConnection>) {
		console.log('[Server] Constructor called');
		this.connection = connection;
		this.documents = new TextDocuments(TextDocument);
		console.log('[Server] TextDocuments created');
		console.log('[Server] Creating WorkspaceManager...');
		this.workspaceManager = new WorkspaceManager([]);
		console.log('[Server] Creating HCLParser...');
		this.parser = new HCLParser();
		console.log('[Server] Creating ResolutionEngine...');
		this.resolutionEngine = new ResolutionEngine(this.workspaceManager);
		console.log('[Server] Creating HoverProvider...');
		this.hoverProvider = new HoverProvider(this.resolutionEngine, this.workspaceManager);
		this.completionProvider = new CompletionProvider(this.workspaceManager);
		this.definitionProvider = new DefinitionProvider(this.workspaceManager);
		this.referencesProvider = new ReferencesProvider(this.workspaceManager);
		this.diagnosticsProvider = new DiagnosticsProvider(this.parser, this.workspaceManager);
	}

	public start(): void {
		console.log('[Server] Registering LSP handlers...');

		// Register handlers
		this.connection.onInitialize(this.onInitialize.bind(this));
		this.connection.onInitialized(this.onInitialized.bind(this));
		this.connection.onDidChangeConfiguration(this.onDidChangeConfiguration.bind(this));
		this.documents.onDidChangeContent(this.onDidChangeContent.bind(this));
		this.connection.onHover(this.onHover.bind(this));
		this.connection.onCompletion(this.onCompletion.bind(this));
		this.connection.onDefinition(this.onDefinition.bind(this));
		this.connection.onReferences(this.onReferences.bind(this));
		this.connection.onRequest('terraform/resolve', this.onResolveRequest.bind(this));
		this.connection.onRequest('terraform/listVariables', this.onListVariablesRequest.bind(this));

		console.log('[Server] All handlers registered');

		// Make the text document manager listen on the connection
		this.documents.listen(this.connection);
		console.log('[Server] Document manager listening');

		// Listen on the connection
		this.connection.listen();
		console.log('[Server] Connection listening - Server ready!');
	}

	private onInitialize(params: InitializeParams) {
		console.log('[Server] onInitialize called');
		const capabilities = params.capabilities;

		this.hasConfigurationCapability = !!(
			capabilities.workspace && !!capabilities.workspace.configuration
		);
		this.hasWorkspaceFolderCapability = !!(
			capabilities.workspace && !!capabilities.workspace.workspaceFolders
		);

		const workspaceFolders = params.workspaceFolders || [];
		console.log('[Server] Workspace folders:', workspaceFolders.length);

		// Don't create a new WorkspaceManager - reuse the existing one!
		// Just update its workspace folders (preserving the index!)
		this.workspaceManager.setWorkspaceFolders(workspaceFolders);

		const serverCapabilities = {
			capabilities: {
				textDocumentSync: TextDocumentSyncKind.Incremental,
				hoverProvider: true,
				completionProvider: {
					resolveProvider: true
				},
				definitionProvider: true,
				referencesProvider: true,
				workspaceSymbolProvider: true
			}
		};

		console.log('[Server] Returning capabilities:', JSON.stringify(serverCapabilities, null, 2));
		return serverCapabilities;
	}

	private async onInitialized(): Promise<void> {
		console.log('[Server] onInitialized called');

		if (this.hasConfigurationCapability) {
			// Register for all configuration changes.
			await this.connection.client.register(
				DidChangeConfigurationNotification.type,
				undefined
			);
			console.log('[Server] Configuration capability registered');
		}
		if (this.hasWorkspaceFolderCapability) {
			this.connection.workspace.onDidChangeWorkspaceFolders((_event) => {
				console.log('[Server] Workspace folder change event received.');
			});
			console.log('[Server] Workspace folder capability registered');
		}

		// Initialize workspace with actual workspace folders
		console.log('[Server] Initializing workspace...');
		// Workspace folders were already set in onInitialize
		await this.workspaceManager.initialize();
		console.log('[Server] Workspace initialized successfully');
		console.log('[Server] ✅ SERVER FULLY READY - All systems operational');
	}

	private onDidChangeConfiguration(): void {
		// Revalidate all open text documents
		this.documents.all().forEach((document) => {
			this.validateTextDocument(document);
		});
	}

	private async onDidChangeContent(change: { document: TextDocument }): Promise<void> {
		const document = change.document;
		console.log('[Server] ========================================');
		console.log('[Server] 📝 Document changed:', document.uri);
		console.log('[Server] Document language:', document.languageId);
		console.log('[Server] Document text length:', document.getText().length);
		console.log('[Server] URI ends with .hcl:', document.uri.endsWith('.hcl'));
		console.log('[Server] URI ends with terragrunt.hcl:', document.uri.endsWith('terragrunt.hcl'));

		// Parse document
		const ast = await this.parser.parse(document);
		console.log('[Server] Parsed AST, nodes:', ast.length);
		if (ast.length > 0) {
			console.log('[Server] First node type:', ast[0].type, 'blockType:', (ast[0] as any).blockType);
		}

		// Update workspace index
		console.log('[Server] Updating workspace index with URI:', document.uri);
		this.workspaceManager.updateDocument(document.uri, ast);
		console.log('[Server] Workspace index updated');

		// Pre-load include blocks for ALL HCL files (Terragrunt uses .hcl)
		const isHclFile = document.uri.endsWith('.hcl') || document.uri.includes('terragrunt.hcl');
		console.log('[Server] Is HCL file?', isHclFile);

		if (isHclFile || document.languageId === 'terragrunt') {
			console.log('[Server] ✅ File is Terragrunt/HCL, pre-loading includes...');
			await this.preloadIncludes(document, ast);
			await this.preloadReadTerragruntConfig(document, ast);
			console.log('[Server] ✅ Pre-loading complete');
		} else {
			console.log('[Server] ⚠️ File is NOT Terragrunt, skipping include pre-loading.');
			console.log('[Server] Language:', document.languageId);
			console.log('[Server] URI:', document.uri);
		}

		// Validate document
		await this.validateTextDocument(document);
		console.log('[Server] ========================================');
	}

	private async validateTextDocument(textDocument: TextDocument): Promise<void> {
		const diagnostics = await this.diagnosticsProvider.provideDiagnostics(textDocument);
		this.connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
	}

	private async onHover(params: TextDocumentPositionParams): Promise<Hover | null> {
		console.log('[Server] 🔍 Hover request received at line:', params.position.line, 'char:', params.position.character);
		console.log('[Server] Document URI:', params.textDocument.uri);

		const document = this.documents.get(params.textDocument.uri);
		if (!document) {
			console.log('[Server] ❌ Document not found in cache');
			return null;
		}

		console.log('[Server] ✓ Document found, calling hover provider...');
		const result = await this.hoverProvider.provideHover(document, params.position);

		if (result) {
			console.log('[Server] ✅ Hover result:', JSON.stringify(result).substring(0, 200));
		} else {
			console.log('[Server] ⚠️ No hover result returned');
		}

		return result;
	}

	private async onCompletion(params: TextDocumentPositionParams): Promise<CompletionItem[]> {
		const document = this.documents.get(params.textDocument.uri);
		if (!document) {
			return [];
		}
		return this.completionProvider.provideCompletionItems(document, params.position);
	}

	private async onDefinition(params: TextDocumentPositionParams): Promise<Definition | null> {
		const document = this.documents.get(params.textDocument.uri);
		if (!document) {
			return null;
		}
		return this.definitionProvider.provideDefinition(document, params.position);
	}

	private async onReferences(params: ReferenceParams): Promise<Location[] | null> {
		const document = this.documents.get(params.textDocument.uri);
		if (!document) {
			return null;
		}
		return this.referencesProvider.provideReferences(document, params.position, params.context);
	}

	private async onResolveRequest(params: { uri: string; expression: string }): Promise<any> {
		const document = this.documents.get(params.uri);
		if (!document) {
			return null;
		}
		return this.resolutionEngine.resolve(params.expression, {
			currentUri: params.uri
		});
	}

	private async onListVariablesRequest(params: { category: string; uri?: string }): Promise<any[]> {
		return this.resolutionEngine.listVariables(params.category, params.uri);
	}

	/**
	 * Pre-load include blocks: detect path types, resolve paths, extract values, cache
	 */
	private async preloadIncludes(document: TextDocument, ast: any[]): Promise<void> {
		console.log('[Server] 🔍 Pre-loading includes for:', document.uri);

		// Find all include blocks
		const includeBlocks = IncludeService.findIncludeBlocks(ast);
		console.log(`[Server] Found ${includeBlocks.length} include block(s)`);

		if (includeBlocks.length === 0) {
			return;
		}

		// Clear existing cache for this file
		this.workspaceManager.getIncludeCache().clear(document.uri);
		this.workspaceManager.getIncludeCache().clearReadConfig(document.uri);

		// Process each include block
		for (const includeBlock of includeBlocks) {
			console.log(`[Server] Processing include "${includeBlock.name}" (path type: ${includeBlock.pathType})`);

			// Detect path type and resolve file path
			const resolutionResult = await IncludeService.resolveIncludePath(includeBlock, document.uri);

			if (!resolutionResult.uri) {
				console.log(`[Server] ⚠️ Could not resolve include "${includeBlock.name}": ${resolutionResult.source}`);
				continue;
			}

			console.log(`[Server] ✅ Resolved include "${includeBlock.name}" to: ${resolutionResult.uri}`);

			// Read and parse the included file
			const content = await FileReader.readFile(resolutionResult.uri);
			if (!content) {
				console.log(`[Server] ⚠️ Could not read file: ${resolutionResult.uri}`);
				continue;
			}

			const includedDocument = TextDocument.create(resolutionResult.uri, 'terragrunt', 1, content);
			const includedAst = await this.parser.parse(includedDocument);

			// Update workspace index with included file AST
			this.workspaceManager.updateDocument(resolutionResult.uri, includedAst);

			// Extract all values from the included file
			const extractedValues = ValueExtractor.extractAllValues(includedAst);
			console.log(`[Server] Extracted values: ${Object.keys(extractedValues.locals).length} locals, ${Object.keys(extractedValues.inputs).length} inputs`);
			console.log(`[Server] Extracted locals keys:`, Object.keys(extractedValues.locals));
			console.log(`[Server] Sample local value (account_tags):`, JSON.stringify(extractedValues.locals.account_tags || extractedValues.locals['account_tags'] || 'not found').substring(0, 200));

			// Cache the extracted values
			this.workspaceManager.getIncludeCache().cacheIncludeValues(
				document.uri,
				includeBlock.name,
				extractedValues,
				resolutionResult.uri,
				resolutionResult.source
			);
		}

		console.log(`[Server] ✅ Finished pre-loading ${includeBlocks.length} include(s)`);
	}

	/**
	 * Pre-load read_terragrunt_config() calls: detect calls, resolve paths, extract values, cache
	 */
	private async preloadReadTerragruntConfig(document: TextDocument, ast: any[]): Promise<void> {
		console.log('[Server] 🔍 Pre-loading read_terragrunt_config calls for:', document.uri);

		// Find all read_terragrunt_config calls in locals blocks
		const readConfigCalls = ReadTerragruntConfigService.findReadTerragruntConfigCalls(ast);
		console.log(`[Server] Found ${readConfigCalls.length} read_terragrunt_config call(s)`);

		if (readConfigCalls.length === 0) {
			return;
		}

		// Process each read_terragrunt_config call
		for (const call of readConfigCalls) {
			console.log(`[Server] Processing read_terragrunt_config "${call.localName}" (path type: ${call.pathType})`);

			// Resolve file path
			const resolutionResult = await ReadTerragruntConfigService.resolvePath(call, document.uri);

			if (!resolutionResult.uri) {
				console.log(`[Server] ⚠️ Could not resolve read_terragrunt_config "${call.localName}": ${resolutionResult.source}`);
				continue;
			}

			console.log(`[Server] ✅ Resolved read_terragrunt_config "${call.localName}" to: ${resolutionResult.uri}`);

			// Read and parse the file
			const content = await FileReader.readFile(resolutionResult.uri);
			if (!content) {
				console.log(`[Server] ⚠️ Could not read file: ${resolutionResult.uri}`);
				continue;
			}

			const configDocument = TextDocument.create(resolutionResult.uri, 'terragrunt', 1, content);
			const configAst = await this.parser.parse(configDocument);

			// Update workspace index with file AST
			this.workspaceManager.updateDocument(resolutionResult.uri, configAst);

			// Extract all values from the file
			const extractedValues = ValueExtractor.extractAllValues(configAst);
			console.log(`[Server] Extracted values for read_terragrunt_config "${call.localName}": ${Object.keys(extractedValues.locals).length} locals, ${Object.keys(extractedValues.inputs).length} inputs`);

			// Cache the extracted values
			this.workspaceManager.getIncludeCache().cacheReadTerragruntConfig(
				document.uri,
				call.localName,
				extractedValues,
				resolutionResult.uri,
				resolutionResult.source
			);
		}

		console.log(`[Server] ✅ Finished pre-loading ${readConfigCalls.length} read_terragrunt_config call(s)`);
	}

}

