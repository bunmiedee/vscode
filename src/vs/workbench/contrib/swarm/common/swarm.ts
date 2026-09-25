/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';

/**
 * The set of top-level surfaces the swarm application can show. Each value maps
 * to a view in the swarm activity bar. This is the single source of truth for
 * "which mode is the swarm app in", shared between the swarm app itself and the
 * workbench outlet that hosts it.
 */
export const enum SwarmView {
	Agents = 'agents',
	Models = 'models',
	SourceControl = 'sourceControl',
	Notifications = 'notifications',
	Terminals = 'terminals',
	Account = 'account',
	Settings = 'settings',
}

/**
 * A single entry in the swarm activity bar. The swarm app owns the list; the
 * outlet renders it. Keeping this data-only means the outlet never needs to
 * know about swarm internals.
 */
export interface ISwarmActivityItem {
	readonly id: SwarmView;
	readonly label: string;
	readonly iconId: string;
	readonly group: 'top' | 'bottom';
}

/**
 * The kind of a single line in a swarm file diff. Mirrors the unified-diff
 * vocabulary: added, deleted, unchanged context, or a hunk header.
 */
export const enum SwarmDiffLineType {
	Add = 'add',
	Delete = 'delete',
	Context = 'context',
	Hunk = 'hunk',
}

/** A single line of a swarm file diff. */
export interface ISwarmDiffLine {
	readonly type: SwarmDiffLineType;
	readonly text: string;
}

/** How a file changed relative to its base revision. */
export const enum SwarmFileStatus {
	Modified = 'modified',
	Added = 'added',
	Deleted = 'deleted',
}

/** A single file's diff, as shown in the swarm mini code view. */
export interface ISwarmFileDiff {
	readonly path: string;
	readonly status: SwarmFileStatus;
	readonly additions: number;
	readonly deletions: number;
	readonly lines: readonly ISwarmDiffLine[];
}

/** The verdict a reviewer can attach when submitting a swarm code review. */
export const enum SwarmReviewVerdict {
	Comment = 'comment',
	Approve = 'approve',
	RequestChanges = 'requestChanges',
}

/**
 * The view-facing contract of the swarm application, free of DOM types so it
 * can live in the `common` layer. The browser-side {@link ISwarmApp} extends
 * this with the root element.
 */
export interface ISwarmAppInfo extends IDisposable {

	/** The activity bar items the swarm app wants the outlet to show. */
	readonly activityItems: readonly ISwarmActivityItem[];

	/** The currently active swarm view. */
	readonly activeView: SwarmView;

	/** Fires when the active view changes. */
	readonly onDidChangeActiveView: Event<SwarmView>;

	/** Switch the swarm app to the given view. */
	setActiveView(view: SwarmView): void;

	/** Add a new agent chat to the swarm grid. */
	addChat(): void;
}
