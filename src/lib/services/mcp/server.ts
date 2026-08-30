/**
 * MCP server factory (phase 12) — one McpServer with the four Dupip tools.
 */

import 'server-only'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerDupipTools } from './tools'

export const DUPIP_MCP_SERVER_NAME = 'dupip'
export const DUPIP_MCP_SERVER_VERSION = '0.1.0'

export function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: DUPIP_MCP_SERVER_NAME,
    version: DUPIP_MCP_SERVER_VERSION
  })
  registerDupipTools(server)
  return server
}
