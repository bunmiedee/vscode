/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISwarmDiffLine, ISwarmFileDiff, SwarmDiffLineType, SwarmFileStatus } from '../common/swarm.js';

/**
 * Seed data for the swarm mini code view.
 *
 * The code view is currently a UI-only surface: it renders representative
 * diffs so the layout, inline comments, and inline edits can be exercised
 * before the real chat/git data sources are wired up. Replace this module with
 * a service-backed provider once the data plumbing lands.
 */

function hunk(header: string, lines: readonly (readonly [SwarmDiffLineType, string])[]): ISwarmDiffLine[] {
	return [
		{ type: SwarmDiffLineType.Hunk, text: header },
		...lines.map(([type, text]) => ({ type, text })),
	];
}

const AUTH_DIFFS: readonly ISwarmFileDiff[] = [
	{
		path: 'src/auth/useRefreshToken.ts',
		status: SwarmFileStatus.Modified,
		additions: 12,
		deletions: 4,
		lines: hunk('@@ -12,7 +12,9 @@ export async function useRefreshToken(raw: string) {', [
			[SwarmDiffLineType.Context, '  const token = parseToken(raw);'],
			[SwarmDiffLineType.Context, '  if (!token) {'],
			[SwarmDiffLineType.Delete, '    return null;'],
			[SwarmDiffLineType.Add, '    throw new TokenError("malformed token");'],
			[SwarmDiffLineType.Context, '  }'],
			[SwarmDiffLineType.Context, ''],
			[SwarmDiffLineType.Add, '  // Rotate before the token can expire mid-request.'],
			[SwarmDiffLineType.Add, '  await rotateIfExpiring(token, 30_000);'],
			[SwarmDiffLineType.Context, '  return token;'],
		]),
	},
	{
		path: 'src/auth/rotate.ts',
		status: SwarmFileStatus.Modified,
		additions: 6,
		deletions: 2,
		lines: hunk('@@ -3,6 +3,9 @@ export function rotate(prev: Token) {', [
			[SwarmDiffLineType.Context, '  const next = mint(prev.subject);'],
			[SwarmDiffLineType.Delete, '  store.set(next);'],
			[SwarmDiffLineType.Add, '  store.set(next, { ttl: prev.ttl });'],
			[SwarmDiffLineType.Add, '  audit.record("rotate", prev.subject);'],
			[SwarmDiffLineType.Context, '  return next;'],
		]),
	},
	{
		path: 'src/auth/__tests__/rotate.test.ts',
		status: SwarmFileStatus.Added,
		additions: 18,
		deletions: 0,
		lines: hunk('@@ -0,0 +1,18 @@', [
			[SwarmDiffLineType.Add, 'import { rotate } from "../rotate";'],
			[SwarmDiffLineType.Add, ''],
			[SwarmDiffLineType.Add, 'test("preserves ttl across rotation", () => {'],
			[SwarmDiffLineType.Add, '  const prev = mint("user-1", { ttl: 60_000 });'],
			[SwarmDiffLineType.Add, '  expect(rotate(prev).ttl).toBe(60_000);'],
			[SwarmDiffLineType.Add, '});'],
		]),
	},
];

const PERF_DIFFS: readonly ISwarmFileDiff[] = [
	{
		path: 'src/feed/getFeed.ts',
		status: SwarmFileStatus.Modified,
		additions: 14,
		deletions: 9,
		lines: hunk('@@ -20,15 +20,12 @@ export async function getFeed(userId: string) {', [
			[SwarmDiffLineType.Context, '  const ids = await following(userId);'],
			[SwarmDiffLineType.Delete, '  const posts = await Promise.all(ids.map(loadPosts));'],
			[SwarmDiffLineType.Delete, '  return posts.flat().sort(byRecency);'],
			[SwarmDiffLineType.Add, '  const posts = await loadPostsBatch(ids);'],
			[SwarmDiffLineType.Add, '  return posts.sort(byRecency);'],
			[SwarmDiffLineType.Context, '}'],
		]),
	},
	{
		path: 'src/feed/loadPostsBatch.ts',
		status: SwarmFileStatus.Added,
		additions: 11,
		deletions: 0,
		lines: hunk('@@ -0,0 +1,11 @@', [
			[SwarmDiffLineType.Add, 'export async function loadPostsBatch(ids: string[]) {'],
			[SwarmDiffLineType.Add, '  const rows = await db.query('],
			[SwarmDiffLineType.Add, '    "select * from posts where author = any($1)",'],
			[SwarmDiffLineType.Add, '    [ids],'],
			[SwarmDiffLineType.Add, '  );'],
			[SwarmDiffLineType.Add, '  return rows;'],
			[SwarmDiffLineType.Add, '}'],
		]),
	},
];

const CSRF_DIFFS: readonly ISwarmFileDiff[] = [
	{
		path: 'src/security/verifyToken.ts',
		status: SwarmFileStatus.Modified,
		additions: 5,
		deletions: 3,
		lines: hunk('@@ -8,7 +8,7 @@ export function verifyToken(a: string, b: string) {', [
			[SwarmDiffLineType.Context, '  const expected = sign(a);'],
			[SwarmDiffLineType.Delete, '  return expected === b;'],
			[SwarmDiffLineType.Add, '  return timingSafeEqual(expected, b);'],
			[SwarmDiffLineType.Context, '}'],
		]),
	},
];

const REVIEW_DIFFS: readonly ISwarmFileDiff[] = [
	{
		path: 'src/session/store.ts',
		status: SwarmFileStatus.Modified,
		additions: 9,
		deletions: 6,
		lines: hunk('@@ -1,18 +1,9 @@', [
			[SwarmDiffLineType.Context, 'export class SessionStore {'],
			[SwarmDiffLineType.Delete, '  private sessions = new Map<string, Session>();'],
			[SwarmDiffLineType.Add, '  private readonly sessions = new Map<string, Session>();'],
			[SwarmDiffLineType.Context, ''],
			[SwarmDiffLineType.Context, '  get(id: string) {'],
			[SwarmDiffLineType.Delete, '    return this.sessions.get(id) || null;'],
			[SwarmDiffLineType.Add, '    return this.sessions.get(id) ?? null;'],
			[SwarmDiffLineType.Context, '  }'],
			[SwarmDiffLineType.Context, '}'],
		]),
	},
	{
		path: 'src/session/legacyStore.ts',
		status: SwarmFileStatus.Deleted,
		additions: 0,
		deletions: 24,
		lines: hunk('@@ -1,24 +0,0 @@', [
			[SwarmDiffLineType.Delete, '// Superseded by SessionStore.'],
			[SwarmDiffLineType.Delete, 'export const legacyStore = {'],
			[SwarmDiffLineType.Delete, '  sessions: {},'],
			[SwarmDiffLineType.Delete, '};'],
		]),
	},
];

/**
 * The seed diffs for a swarm chat window, keyed by the window's preset title.
 * Falls back to the auth diffs for unknown titles.
 */
export function getSeedDiffsForPreset(title: string): readonly ISwarmFileDiff[] {
	switch (title) {
		case 'planner':
			return PERF_DIFFS;
		case 'codegen':
			return CSRF_DIFFS;
		case 'review':
			return REVIEW_DIFFS;
		default:
			return AUTH_DIFFS;
	}
}
