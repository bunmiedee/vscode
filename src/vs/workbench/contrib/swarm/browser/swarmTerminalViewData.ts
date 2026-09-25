/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISwarmTerminalLine, ISwarmTerminalTab, SwarmTerminalLineType } from '../common/swarm.js';

/**
 * Seed data for the swarm terminal view.
 *
 * The terminal view is currently a UI-only surface: it renders representative
 * transcripts so the tab strip, transcript styling, and prompt row can be
 * exercised before the real terminal data source is wired up. Replace this
 * module with a service-backed provider once the data plumbing lands.
 */

function line(type: SwarmTerminalLineType, text: string): ISwarmTerminalLine {
	return { type, text };
}

const AUTH_REFACTOR_TABS: readonly ISwarmTerminalTab[] = [
	{
		id: 'zsh',
		title: 'zsh',
		lines: [
			line(SwarmTerminalLineType.Info, 'Restored session · ~/wt/fridays/session'),
			line(SwarmTerminalLineType.Command, 'session pnpm test auth'),
			line(SwarmTerminalLineType.Success, '24 passed, 0 failed (3.1s)'),
		],
	},
	{
		id: 'dev-server',
		title: 'dev-server',
		lines: [
			line(SwarmTerminalLineType.Info, 'Restored session · ~/wt/fridays/session'),
			line(SwarmTerminalLineType.Command, 'pnpm dev'),
			line(SwarmTerminalLineType.Output, '  VITE v5.4.2  ready in 412 ms'),
			// allow-any-unicode-next-line
			line(SwarmTerminalLineType.Output, '  ➜  Local:   http://localhost:5173/'),
			// allow-any-unicode-next-line
			line(SwarmTerminalLineType.Output, '  ➜  Network: use --host to expose'),
		],
	},
];

const PLANNER_TABS: readonly ISwarmTerminalTab[] = [
	{
		id: 'zsh',
		title: 'zsh',
		lines: [
			line(SwarmTerminalLineType.Info, 'Restored session · ~/wt/fridays/planner'),
			line(SwarmTerminalLineType.Command, 'git status --short'),
			line(SwarmTerminalLineType.Output, ' M src/spec/plan.ts'),
			line(SwarmTerminalLineType.Output, '?? src/spec/draft.md'),
		],
	},
];

const CODEGEN_TABS: readonly ISwarmTerminalTab[] = [
	{
		id: 'zsh',
		title: 'zsh',
		lines: [
			line(SwarmTerminalLineType.Info, 'Restored session · ~/wt/fridays/codegen'),
			line(SwarmTerminalLineType.Command, 'pnpm build'),
			line(SwarmTerminalLineType.Output, 'esbuild src/index.ts --bundle --outfile=dist/index.js'),
			line(SwarmTerminalLineType.Success, 'dist/index.js  42.1kb  Done in 118ms'),
		],
	},
	{
		id: 'watch',
		title: 'watch',
		lines: [
			line(SwarmTerminalLineType.Info, 'Restored session · ~/wt/fridays/codegen'),
			line(SwarmTerminalLineType.Command, 'pnpm watch'),
			line(SwarmTerminalLineType.Output, 'Watching for changes…'),
		],
	},
];

const REVIEW_TABS: readonly ISwarmTerminalTab[] = [
	{
		id: 'zsh',
		title: 'zsh',
		lines: [
			line(SwarmTerminalLineType.Info, 'Restored session · ~/wt/fridays/review'),
			line(SwarmTerminalLineType.Command, 'pnpm lint'),
			line(SwarmTerminalLineType.Error, 'src/review/diff.ts:42:7  error  Unexpected any  @typescript-eslint/no-explicit-any'),
			// allow-any-unicode-next-line
			line(SwarmTerminalLineType.Error, '✖ 1 problem (1 error, 0 warnings)'),
		],
	},
];

const TABS_BY_PRESET: Record<string, readonly ISwarmTerminalTab[]> = {
	'auth-refactor': AUTH_REFACTOR_TABS,
	'planner': PLANNER_TABS,
	'codegen': CODEGEN_TABS,
	'review': REVIEW_TABS,
};

/** Returns the seed terminal tabs for a given agent window preset title. */
export function getSeedTerminalTabsForPreset(title: string): readonly ISwarmTerminalTab[] {
	return TABS_BY_PRESET[title] ?? AUTH_REFACTOR_TABS;
}
