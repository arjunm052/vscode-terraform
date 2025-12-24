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

	// Map: currentFileUri -> Map<localName -> CachedIncludeValues> for read_terragrunt_config results
	private readConfigCache: Map<string, Map<string, CachedIncludeValues>> = new Map();

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

	/**
	 * Cache read_terragrunt_config values for a file
	 */
	cacheReadTerragruntConfig(
		fileUri: string,
		localName: string,
		values: ExtractedValues,
		sourceUri: string,
		resolvedPath: string
	): void {
		console.log(`[IncludeCache] Caching read_terragrunt_config "${localName}" for file: ${fileUri}`);
		console.log(`[IncludeCache] Source URI: ${sourceUri}, Resolved path: ${resolvedPath}`);

		if (!this.readConfigCache.has(fileUri)) {
			this.readConfigCache.set(fileUri, new Map());
		}

		const fileCache = this.readConfigCache.get(fileUri)!;
		fileCache.set(localName, {
			...values,
			sourceUri,
			resolvedPath
		});

		console.log(`[IncludeCache] ✅ Cached read_terragrunt_config ${localName} with ${Object.keys(values.locals).length} locals, ${Object.keys(values.inputs).length} inputs`);
	}

	/**
	 * Get cached read_terragrunt_config values for a specific local name
	 */
	getReadTerragruntConfig(fileUri: string, localName: string): CachedIncludeValues | undefined {
		console.log(`[IncludeCache] Looking for read_terragrunt_config "${localName}" in file: ${fileUri}`);
		const fileCache = this.readConfigCache.get(fileUri);
		if (!fileCache) {
			console.log(`[IncludeCache] ❌ No cache found for file: ${fileUri}`);
			console.log(`[IncludeCache] Available cached files:`, Array.from(this.readConfigCache.keys()));
			return undefined;
		}

		const cached = fileCache.get(localName);
		if (!cached) {
			console.log(`[IncludeCache] ❌ No cache found for local "${localName}" in file: ${fileUri}`);
			console.log(`[IncludeCache] Available locals in cache:`, Array.from(fileCache.keys()));
		} else {
			console.log(`[IncludeCache] ✅ Found cached read_terragrunt_config "${localName}"`);
		}
		return cached;
	}

	/**
	 * Clear read_terragrunt_config cache for a specific file
	 */
	clearReadConfig(fileUri: string): void {
		console.log(`[IncludeCache] Clearing read_terragrunt_config cache for file: ${fileUri}`);
		this.readConfigCache.delete(fileUri);
	}
}

