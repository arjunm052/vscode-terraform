/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createConnection, BrowserMessageReader, BrowserMessageWriter, ProposedFeatures } from 'vscode-languageserver/browser';
import { Server } from '../server';

// Create a connection for the server
const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);
const connection = createConnection(ProposedFeatures.all, messageReader, messageWriter);

// Create the server instance
const server = new Server(connection);

// Start listening
server.start();

