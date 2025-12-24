/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HCLNode, BlockNode, AttributeNode } from '../parser/astTypes';

export interface ExtractedValues {
	locals: Record<string, any>;
	inputs: Record<string, any>;
	variables: Record<string, any>;
	attributes: Record<string, any>;
}

export class ValueExtractor {
	/**
	 * Extract all values from a parsed AST, organized by block type
	 */
	static extractAllValues(ast: HCLNode[]): ExtractedValues {
		const values: ExtractedValues = {
			locals: {},
			inputs: {},
			variables: {},
			attributes: {}
		};

		// First pass: extract all values (may contain unresolved references)
		for (const node of ast) {
			if (node.type === 'block') {
				const blockNode = node as BlockNode;
				const blockType = blockNode.blockType;

				switch (blockType) {
					case 'locals':
						// Extract locals first, then use them for resolving references in subsequent extractions
						const locals = this.extractBlockNodeValues(blockNode, values);
						Object.assign(values.locals, locals);
						break;
					case 'inputs':
						Object.assign(values.inputs, this.extractBlockNodeValues(blockNode, values));
						break;
					case 'variable':
						Object.assign(values.variables, this.extractBlockNodeValues(blockNode, values));
						break;
					default:
						// For other block types, extract as attributes
						if (blockNode.name) {
							values.attributes[blockNode.name] = this.extractBlockNodeValues(blockNode, values);
						}
				}
			} else if (node.type === 'attribute') {
				const attrNode = node as AttributeNode;
				values.attributes[attrNode.attributeName] = this.extractValue(attrNode.value, values);
			}
		}

		// Second pass: resolve all local variable references
		// Do multiple passes to handle nested references (e.g., local.a references local.b)
		for (let i = 0; i < 10; i++) {
			const before = JSON.stringify(values);
			this.resolveLocalReferences(values);
			const after = JSON.stringify(values);
			if (before === after) {
				// No more changes, all references resolved
				break;
			}
		}

		console.log(`[ValueExtractor] After resolution - account_tags sample:`, JSON.stringify(values.locals.account_tags || values.locals['account_tags'] || 'not found').substring(0, 300));

		return values;
	}

	/**
	 * Extract values from a specific block type
	 */
	static extractBlockValues(ast: HCLNode[], blockType?: string): Record<string, any> {
		const values: Record<string, any> = {};

		for (const node of ast) {
			if (node.type === 'block') {
				const blockNode = node as BlockNode;
				if (!blockType || blockNode.blockType === blockType) {
					// Extract attributes from this block
					if (blockNode.children) {
						for (const child of blockNode.children) {
							if (child.type === 'attribute') {
								const attrNode = child as AttributeNode;
								values[attrNode.attributeName] = this.extractValue(attrNode.value);
							}
						}
					}
				}
			} else if (node.type === 'attribute') {
				const attrNode = node as AttributeNode;
				values[attrNode.attributeName] = this.extractValue(attrNode.value);
			}
		}

		return values;
	}

	/**
	 * Extract a value from an AST node (recursively handles nested structures)
	 * @param node The AST node to extract value from
	 * @param context The extracted values context for resolving local references
	 */
	private static extractValue(node: HCLNode, context?: ExtractedValues): any {
		if (node.type === 'literal') {
			return node.value;
		}

		if (node.type === 'attribute') {
			const attrNode = node as AttributeNode;
			return this.extractValue(attrNode.value, context);
		}

		if (node.type === 'block') {
			const blockNode = node as BlockNode;
			// Handle map blocks and nested blocks recursively
			const result: Record<string, any> = {};
			if (blockNode.children) {
				for (const child of blockNode.children) {
					if (child.type === 'attribute') {
						const attrNode = child as AttributeNode;
						// Recursively extract nested values
						result[attrNode.attributeName] = this.extractValue(attrNode.value, context);
					} else if (child.type === 'block') {
						// Handle nested blocks (like nested maps)
						const nestedBlock = child as BlockNode;
						if (nestedBlock.name) {
							result[nestedBlock.name] = this.extractBlockNodeValues(nestedBlock, context);
						} else {
							// Anonymous block (like map) - merge its values
							const nestedValues = this.extractBlockNodeValues(nestedBlock, context);
							Object.assign(result, nestedValues);
						}
					}
				}
			}
			return result;
		}

		// For variable references, try to resolve if it's a local reference
		if (node.type === 'variable_reference') {
			const varRef = node as any;
			const refName = varRef.name || (node as any).value || '';
			const prefix = varRef.prefix;

			// Check if it's a local reference
			if ((prefix === 'local' || refName.startsWith('local.')) && context) {
				const localName = prefix === 'local'
					? (varRef.path?.[0] || refName.replace('local.', '').split('.')[0])
					: refName.replace('local.', '').split('.')[0];

				if (localName) {
					// Return reference marker that will be resolved later
					// We'll resolve it in the second pass after all locals are extracted
					return { __ref: `local.${localName}` };
				}
			}

			// For other variable references, return the expression as-is
			return refName;
		}

		// For function calls, return the expression as-is
		if (node.type === 'function_call') {
			return node.name || node.value;
		}

		// Default: return the value if available
		// Check if it's a string that looks like a local reference
		if (node.value && typeof node.value === 'string' && node.value.startsWith('local.') && context) {
			const localName = node.value.replace('local.', '').split('.')[0];
			if (localName && context.locals[localName] !== undefined) {
				return { __ref: `local.${localName}` };
			}
		}

		return node.value;
	}

	/**
	 * Get a nested value from extracted values using dot notation
	 * e.g., "locals.account_tags" or "locals.account_tags.Environment"
	 */
	static getNestedValue(values: ExtractedValues, path: string): any {
		const parts = path.split('.');
		let current: any = values;

		for (const part of parts) {
			if (current === null || current === undefined) {
				return null;
			}

			// First part should be a top-level key (locals, inputs, variables, attributes)
			if (parts.indexOf(part) === 0) {
				current = current[part];
				continue;
			}

			// Subsequent parts navigate into the object
			if (typeof current === 'object' && current !== null) {
				current = current[part];
			} else {
				return null;
			}
		}

		return current;
	}

	/**
	 * Extract values from a block node (private helper) - handles nested structures recursively
	 * @param blockNode The block node to extract values from
	 * @param context The extracted values context for resolving local references
	 */
	private static extractBlockNodeValues(blockNode: BlockNode, context?: ExtractedValues): Record<string, any> {
		const values: Record<string, any> = {};

		if (blockNode.children) {
			for (const child of blockNode.children) {
				if (child.type === 'attribute') {
					const attrNode = child as AttributeNode;
					// Recursively extract value (handles nested maps/blocks)
					values[attrNode.attributeName] = this.extractValue(attrNode.value, context);
				} else if (child.type === 'block') {
					const nestedBlock = child as BlockNode;
					if (nestedBlock.name) {
						// Named nested block - extract recursively
						values[nestedBlock.name] = this.extractBlockNodeValues(nestedBlock, context);
					} else {
						// Anonymous block (like map) - merge its values into current level
						const nestedValues = this.extractBlockNodeValues(nestedBlock, context);
						Object.assign(values, nestedValues);
					}
				}
			}
		}

		return values;
	}

	/**
	 * Resolve local variable references in extracted values
	 * Recursively resolves references like local.account_name to their actual values
	 */
	private static resolveLocalReferences(values: ExtractedValues, visited: Set<string> = new Set()): void {
		const resolveValue = (obj: any, path: string = ''): any => {
			if (obj === null || obj === undefined) {
				return obj;
			}

			// Check if this is a reference marker
			if (typeof obj === 'object' && obj !== null && !Array.isArray(obj) && obj.__ref) {
				const refPath = obj.__ref;
				if (visited.has(refPath)) {
					// Circular reference detected
					return `[Circular: ${refPath}]`;
				}
				visited.add(refPath);

				// Resolve local.var_name
				const match = refPath.match(/^local\.(.+)$/);
				if (match && values.locals[match[1]] !== undefined) {
					const resolved = resolveValue(values.locals[match[1]], `${path}.${match[1]}`);
					visited.delete(refPath);
					return resolved;
				}

				visited.delete(refPath);
				// If reference couldn't be resolved, return the original reference string
				return refPath;
			}

			// Check if it's a string that looks like a local reference
			if (typeof obj === 'string' && obj.startsWith('local.')) {
				const localName = obj.replace('local.', '').split('.')[0];
				if (localName && values.locals[localName] !== undefined) {
					return resolveValue(values.locals[localName], `${path}.${localName}`);
				}
			}

			// If it's an array, resolve each element
			if (Array.isArray(obj)) {
				return obj.map((item, idx) => resolveValue(item, `${path}[${idx}]`));
			}

			// If it's an object, resolve each property
			if (typeof obj === 'object' && obj !== null) {
				const resolved: Record<string, any> = {};
				for (const [key, val] of Object.entries(obj)) {
					resolved[key] = resolveValue(val, path ? `${path}.${key}` : key);
				}
				return resolved;
			}

			return obj;
		};

		// Resolve locals (need to create a copy to avoid modifying during iteration)
		const localsCopy = { ...values.locals };
		for (const key in localsCopy) {
			values.locals[key] = resolveValue(localsCopy[key], key);
		}

		// Resolve inputs
		const inputsCopy = { ...values.inputs };
		for (const key in inputsCopy) {
			values.inputs[key] = resolveValue(inputsCopy[key], key);
		}

		// Resolve variables
		const variablesCopy = { ...values.variables };
		for (const key in variablesCopy) {
			values.variables[key] = resolveValue(variablesCopy[key], key);
		}

		// Resolve attributes
		const attributesCopy = { ...values.attributes };
		for (const key in attributesCopy) {
			values.attributes[key] = resolveValue(attributesCopy[key], key);
		}
	}
}

