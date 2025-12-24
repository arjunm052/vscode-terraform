/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtractedValues } from './valueExtractor';

export interface CachedIncludeValues extends ExtractedValues {
	sourceUri: string; // Where values came from
	resolvedPath: string; // How path was resolved
}

export class IncludeCache {
	// Map: currentFileUri -> Map<includeBlockName -> CachedIncludeValues>
	private cache: Map<string, Map<string, CachedIncludeValues>> = new Map();

	/**
	 * Cache include values for a file
	 */
	cacheIncludeValues(
		fileUri: string,
		includeBlockName: string,
		values: ExtractedValues,
		sourceUri: string,
		resolvedPath: string
	): void {
		console.log(`[IncludeCache] Caching include "${includeBlockName}" for file: ${fileUri}`);
		console.log(`[IncludeCache] Source URI: ${sourceUri}, Resolved path: ${resolvedPath}`);

		if (!this.cache.has(fileUri)) {
			this.cache.set(fileUri, new Map());
		}

		const fileCache = this.cache.get(fileUri)!;
		fileCache.set(includeBlockName, {
			...values,
			sourceUri,
			resolvedPath
		});

		console.log(`[IncludeCache] ✅ Cached ${includeBlockName} with ${Object.keys(values.locals).length} locals, ${Object.keys(values.inputs).length} inputs`);
	}

	/**
	 * Get cached include values for a specific include block
	 */
	getIncludeValues(fileUri: string, includeBlockName: string): CachedIncludeValues | undefined {
		const fileCache = this.cache.get(fileUri);
		if (!fileCache) {
			return undefined;
		}

		return fileCache.get(includeBlockName);
	}

	/**
	 * Get all cached include values for a file
	 */
	getAllIncludedValues(fileUri: string): CachedIncludeValues[] {
		const fileCache = this.cache.get(fileUri);
		if (!fileCache) {
			return [];
		}

		return Array.from(fileCache.values());
	}

	/**
	 * Clear cache for a specific file
	 */
	clear(fileUri: string): void {
		console.log(`[IncludeCache] Clearing cache for file: ${fileUri}`);
		this.cache.delete(fileUri);
	}

	/**
	 * Clear all cache
	 */
	clearAll(): void {
		console.log('[IncludeCache] Clearing all cache');
		this.cache.clear();
	}

	/**
	 * Check if a file has any cached includes
	 */
	hasCachedIncludes(fileUri: string): boolean {
		const fileCache = this.cache.get(fileUri);
		return fileCache !== undefined && fileCache.size > 0;
	}
}

