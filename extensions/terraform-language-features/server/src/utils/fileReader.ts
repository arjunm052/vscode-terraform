/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import { URI } from 'vscode-uri';
import * as path from 'path';

export class FileReader {
	/**
	 * Read a file from disk and return its content
	 */
	static async readFile(uri: string): Promise<string | null> {
		try {
			const filePath = URI.parse(uri).fsPath;
			const content = await fs.readFile(filePath, 'utf8');
			return content;
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				// File doesn't exist
				return null;
			}
			console.error(`[FileReader] Error reading file ${uri}:`, error.message);
			return null;
		}
	}

	/**
	 * Check if a file exists
	 */
	static async fileExists(uri: string): Promise<boolean> {
		try {
			const filePath = URI.parse(uri).fsPath;
			await fs.access(filePath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Find a file in parent directories
	 * Returns the path to the file if found, null otherwise
	 */
	static async findInParentDirs(
		startPath: string,
		fileName: string,
		stopAtRoot?: string
	): Promise<string | null> {
		console.log('[FileReader] findInParentDirs: looking for', fileName, 'starting from', startPath);
		let currentDir = path.dirname(startPath);
		const rootPath = stopAtRoot || path.parse(startPath).root;
		console.log('[FileReader] Root path:', rootPath);

		for (let i = 0; i < 20; i++) { // Max 20 levels up
			const filePath = path.join(currentDir, fileName);
			const fileUri = URI.file(filePath).toString();
			console.log('[FileReader] Checking:', filePath);

			if (await this.fileExists(fileUri)) {
				console.log('[FileReader] ✅ Found file:', fileUri);
				return fileUri;
			}

			// Stop if we've reached the root
			if (currentDir === rootPath || currentDir === path.dirname(currentDir)) {
				console.log('[FileReader] Reached root, stopping search');
				break;
			}

			currentDir = path.dirname(currentDir);
		}

		console.log('[FileReader] ❌ File not found in parent directories');
		return null;
	}

	/**
	 * Get workspace root from a file path
	 */
	static getWorkspaceRoot(filePath: string, workspaceFolders: string[]): string | null {
		const normalizedPath = path.normalize(filePath);

		for (const folder of workspaceFolders) {
			const normalizedFolder = path.normalize(folder);
			if (normalizedPath.startsWith(normalizedFolder)) {
				return normalizedFolder;
			}
		}

		return null;
	}
}

