#!/usr/bin/env node
/**
 * Unity MCP Bridge Server
 *
 * Entry point. Implementation lives in `lib/UnityMCPServer.js`.
 */

import { UnityMCPServer } from './lib/UnityMCPServer.js';

const server = new UnityMCPServer();
server.run().catch((error) => {
  process.exitCode = 1;
  console.error(error);
});
