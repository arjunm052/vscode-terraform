/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkspaceFolder } from 'vscode-languageserver';
import { WorkspaceIndex } from './workspaceIndex';
import { FileWatcher } from './fileWatcher';
import { HCLNode } from '../parser/astTypes';
import { URI } from 'vscode-uri';
import * as path from 'path';
import { IncludeCache } from './includeCache';

export class WorkspaceManager {
	private workspaceFolders: WorkspaceFolder[] = [];
	private index: WorkspaceIndex;
	private fileWatcher: FileWatcher;
	private includeCache: IncludeCache;
	private maxWorkspaceSize = 10000;
	private maxFileSize = 1024 * 1024; // 1 MB

	constructor(workspaceFolders: WorkspaceFolder[]) {
		this.workspaceFolders = workspaceFolders;
		this.index = new WorkspaceIndex();
		this.fileWatcher = new FileWatcher(this);
		this.includeCache = new IncludeCache();
	}

	setWorkspaceFolders(workspaceFolders: WorkspaceFolder[]): void {
		this.workspaceFolders = workspaceFolders;
	}

	async initialize(): Promise<void> {
		// Initialize file watchers for each workspace folder
		for (const folder of this.workspaceFolders) {
			this.fileWatcher.watch(folder);
		}

		// Initial indexing can be done in background
		await this.indexWorkspace();
	}

	async indexWorkspace(): Promise<void> {
		// Index each workspace folder independently
		for (const folder of this.workspaceFolders) {
			await this.indexFolder(folder);
		}
	}

	private async indexFolder(folder: WorkspaceFolder): Promise<void> {
		// This would scan the folder for .tf, .hcl, .tfvars files
		// For now, we'll index documents as they're opened/changed
	}

	updateDocument(uri: string, ast: HCLNode[]): void {
		this.index.indexDocument(uri, ast);
	}

	async reindexFile(uri: string): Promise<void> {
		// Re-index a specific file
		// This would be called when a file changes
		// Find files that depend on this file
		const dependents = this.index.findDependents(uri);

		// Invalidate their resolution cache
		// This would be done through the resolution engine
	}

	async findDependency(dependencyPath: string, currentUri: string): Promise<string | null> {
		// Try relative to current file first
		const currentFilePath = URI.parse(currentUri).fsPath;
		const currentDir = path.dirname(currentFilePath);
		const resolvedPath = path.resolve(currentDir, dependencyPath);

		// Check if file exists (would need file system access)
		// For now, return the resolved path
		return URI.file(resolvedPath).toString();

		// Try in each workspace folder
		for (const folder of this.workspaceFolders) {
			const folderPath = URI.parse(folder.uri).fsPath;
			const fullPath = path.resolve(folderPath, dependencyPath);
			// Check if exists
			return URI.file(fullPath).toString();
		}

		return null;
	}

	getIndex(): WorkspaceIndex {
		return this.index;
	}

	getIncludeCache(): IncludeCache {
		return this.includeCache;
	}
}

