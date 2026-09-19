import type { ToolDefinition } from "./types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.toolId)) {
      throw new Error(`Tool already registered: ${tool.toolId}`);
    }
    this.tools.set(tool.toolId, tool);
  }

  get(toolId: string): ToolDefinition {
    const tool = this.tools.get(toolId);
    if (!tool) throw new Error(`Unknown tool: ${toolId}`);
    return tool;
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }
}
