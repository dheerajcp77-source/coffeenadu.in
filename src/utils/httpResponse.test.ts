import test from 'node:test';
import assert from 'node:assert/strict';
import { parseApiJsonResponse } from './httpResponse';

test('parses valid JSON success and error payloads cleanly', () => {
  const okRes = parseApiJsonResponse(
    201,
    'application/json; charset=utf-8',
    JSON.stringify({ ok: true, id: 'cpost-1' })
  );
  assert.equal(okRes.ok, true);
  assert.equal(okRes.id, 'cpost-1');

  const errRes = parseApiJsonResponse(
    400,
    'application/json',
    JSON.stringify({ ok: false, error: 'Missing reason' })
  );
  assert.equal(errRes.ok, false);
  assert.equal(errRes.error, 'Missing reason');
});

test('maps 413 HTML body to clear photo size error', () => {
  const res = parseApiJsonResponse(413, 'text/html', '<html><body>Payload Too Large</body></html>');
  assert.equal(res.ok, false);
  assert.match(String(res.error), /413/);
});

test('maps 502/500 Worker HTML error pages to explicit HTTP status error', () => {
  const res502 = parseApiJsonResponse(502, 'text/html', '<!DOCTYPE html><html>Bad Gateway</html>');
  assert.equal(res502.ok, false);
  assert.match(String(res502.error), /HTTP 502/);

  const res500 = parseApiJsonResponse(500, 'text/plain', 'Worker threw exception');
  assert.equal(res500.ok, false);
  assert.match(String(res500.error), /HTTP 500/);
});

test('maps 401/403 non-JSON responses to session expired error', () => {
  const res = parseApiJsonResponse(401, 'text/html', 'Unauthorized');
  assert.equal(res.ok, false);
  assert.ok(String(res.error).length > 10);
});

test('parses JSON even when content-type header omits application/json', () => {
  const res = parseApiJsonResponse(200, 'text/plain', '{"ok":true,"count":3}');
  assert.equal(res.ok, true);
  assert.equal(res.count, 3);
});
