import assert from "node:assert/strict";
import test from "node:test";

import {
  IdsParams,
  ListTaskParams,
  RemoveTaskParams,
  SetTaskParams,
  UpdateTaskParams,
} from "../src/tools.ts";

/**
 * Meta's API rejects tool parameter schemas deeper than 10 levels:
 * `JSON schema exceeds the maximum nesting depth of 10 levels` (HTTP 400).
 * This guard counts nesting conservatively (every property value, items
 * value, and anyOf/oneOf/allOf member adds a level) and fails before a
 * provider does.
 */
const META_SCHEMA_DEPTH_LIMIT = 10;
const GUARD_LIMIT = META_SCHEMA_DEPTH_LIMIT - 1;

function schemaDepth(schema: unknown, depth: number = 1): number {
  if (Array.isArray(schema)) {
    return schema.reduce((max, member) => Math.max(max, schemaDepth(member, depth)), 0);
  }
  if (!schema || typeof schema !== "object") return depth;
  let max = depth;
  const node = schema as Record<string, unknown>;
  for (const combinator of ["anyOf", "oneOf", "allOf"]) {
    const members = node[combinator];
    if (Array.isArray(members)) {
      for (const member of members) max = Math.max(max, schemaDepth(member, depth + 1));
    }
  }
  const properties = node.properties;
  if (properties && typeof properties === "object") {
    for (const value of Object.values(properties as Record<string, unknown>)) {
      max = Math.max(max, schemaDepth(value, depth + 1));
    }
  }
  if (node.items !== undefined) max = Math.max(max, schemaDepth(node.items, depth + 1));
  return max;
}

test("every tool parameter schema stays under Meta's nesting limit", () => {
  const schemas: Record<string, unknown> = {
    set_tasks: SetTaskParams,
    update_task: UpdateTaskParams,
    rm_task: RemoveTaskParams,
    list_task: ListTaskParams,
    get_task: IdsParams,
  };
  for (const [tool, schema] of Object.entries(schemas)) {
    const depth = schemaDepth(schema);
    assert.ok(
      depth <= GUARD_LIMIT,
      `${tool} schema nests ${depth} levels (guard ${GUARD_LIMIT}, provider limit ${META_SCHEMA_DEPTH_LIMIT}). Lower TASK_NODE_SCHEMA_DEPTH.`,
    );
  }
});

test("set_tasks still describes a nested task node with an open tail", () => {
  const root = SetTaskParams as unknown as { properties: Record<string, { items: unknown }> };
  const node1 = root.properties.tasks?.items as Record<string, unknown>;
  assert.ok(node1?.properties, "set_tasks.tasks.items must be a task node object");
  const children1 = node1.properties as Record<string, { items: unknown }>;
  const node2 = children1.children?.items as Record<string, unknown>;
  assert.equal(node2?.additionalProperties, false, "second task-node level stays closed");
  const children2 = node2.properties as Record<string, { items: unknown }>;
  const node3 = children2.children?.items as Record<string, unknown>;
  assert.ok(node3, "task node keeps a third open-children level");
  assert.equal(node3.additionalProperties, undefined, "the open tail node stays open for deeper trees");
});