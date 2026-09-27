import test from 'node:test';
import assert from 'node:assert/strict';
import SwaggerParser from '@apidevtools/swagger-parser';

test('OpenAPI resolves and documents writable operations and path parameters', async () => {
  const api = await SwaggerParser.validate('src/openapi.json');
  const ids = new Set();
  for (const [path, item] of Object.entries(api.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!['get','post','put','patch','delete'].includes(method)) continue;
      assert.ok(operation.operationId, `${method} ${path}`);
      assert.ok(!ids.has(operation.operationId), 'unique operationId');
      ids.add(operation.operationId);
      for (const [, name] of path.matchAll(/\{([^}]+)\}/g)) {
        assert.ok([...(item.parameters || []), ...(operation.parameters || [])]
          .some(p => p.in === 'path' && p.name === name && p.required), `${path}: ${name}`);
      }
      if (['post','put','patch'].includes(method)) {
        assert.ok(operation.requestBody?.content?.['application/json']?.schema, `${method} ${path}: body`);
      }
      assert.ok(operation.responses.default, `${method} ${path}: errors`);
    }
  }
  for (const path of ['assignments/batch','questions','voting-policy','voter-invites','export.json','import.json']) {
    assert.ok(api.paths[`/api/events/{event_id}/${path}`]);
  }
});
