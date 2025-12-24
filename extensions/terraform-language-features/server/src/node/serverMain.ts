/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { Server } from '../server';

console.error('[Terraform LSP] Server module loaded');

// Create a connection for the server, using Node's IPC as a transport.
const connection = createConnection(ProposedFeatures.all);

console.error('[Terraform LSP] Connection created');

// Redirect console to LSP connection
console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

console.log('[Terraform LSP] Starting Terraform Language Server...');

try {
	// Create the server instance
	const server = new Server(connection);
	console.log('[Terraform LSP] Server instance created');

	// Start listening
	server.start();
	console.log('[Terraform LSP] Server started and listening');
} catch (error) {
	console.error('[Terraform LSP] Failed to start server:', error);
	throw error;
}

