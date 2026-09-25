/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, clearNode } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ISwarmTerminalLine, ISwarmTerminalTab, SwarmTerminalLineType } from '../common/swarm.js';

/** The payload emitted when the user submits a command from the prompt row. */
export interface ISwarmTerminalCommand {
	readonly tabId: string;
	readonly command: string;
}

const LINE_PREFIX: Record<SwarmTerminalLineType, string> = {
	// allow-any-unicode-next-line
	[SwarmTerminalLineType.Command]: '❯',
	[SwarmTerminalLineType.Output]: '',
	// allow-any-unicode-next-line
	[SwarmTerminalLineType.Success]: '✓',
	// allow-any-unicode-next-line
	[SwarmTerminalLineType.Error]: '✗',
	[SwarmTerminalLineType.Info]: '',
};

/**
 * The swarm terminal view.
 *
 * Renders a compact terminal face for an agent window: a tab strip of shell
 * sessions, the active tab's transcript, and a prompt row for running the next
 * command. It mirrors the terminal affordances from the swarm prototype.
 *
 * The view is currently UI-only: it renders seed transcripts and keeps its tab
 * state in memory. Wiring it to a real terminal instance is a follow-up.
 */
export class SwarmTerminalView extends Disposable {

	private readonly _element: HTMLElement;
	private readonly _tabStrip: HTMLElement;
	private readonly _body: HTMLElement;
	private readonly _promptInput: HTMLInputElement;
	private readonly _renderStore = this._register(new DisposableStore());

	private readonly _tabs: ISwarmTerminalTab[];
	private _activeTabId: string;

	private readonly _onDidSubmitCommand = this._register(new Emitter<ISwarmTerminalCommand>());
	readonly onDidSubmitCommand: Event<ISwarmTerminalCommand> = this._onDidSubmitCommand.event;

	constructor(tabs: readonly ISwarmTerminalTab[]) {
		super();

		this._tabs = tabs.length > 0 ? [...tabs] : [{ id: generateUuid(), title: 'zsh', lines: [] }];
		this._activeTabId = this._tabs[0].id;

		this._element = $('.swarm-terminal-view');
		this._element.setAttribute('role', 'region');
		this._element.setAttribute('aria-label', localize('swarm.terminalView.label', "Terminal"));

		this._tabStrip = append(this._element, $('.swarm-terminal-view-tabStrip'));
		this._body = append(this._element, $('.swarm-terminal-view-body'));

		const promptRow = append(this._element, $('.swarm-terminal-view-promptRow'));
		const promptIcon = append(promptRow, $('span.swarm-terminal-view-promptIcon'));
		promptIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));
		this._promptInput = append(promptRow, $('input.swarm-terminal-view-promptInput')) as HTMLInputElement;
		this._promptInput.type = 'text';
		this._promptInput.placeholder = localize('swarm.terminalView.promptPlaceholder', "Run a command…");
		this._promptInput.setAttribute('aria-label', localize('swarm.terminalView.promptLabel', "Run a command"));
		this._renderStore.add(addDisposableListener(this._promptInput, 'keydown', event => {
			if (event.key === 'Enter') {
				event.preventDefault();
				this._submitCommand();
			}
		}));

		this._render();
	}

	get element(): HTMLElement {
		return this._element;
	}

	/** The id of the currently active terminal tab. */
	get activeTabId(): string {
		return this._activeTabId;
	}

	/** Focuses the prompt input so the user can type the next command. */
	focus(): void {
		this._promptInput.focus();
	}

	private _render(): void {
		this._renderStore.clear();
		clearNode(this._tabStrip);
		clearNode(this._body);

		for (const tab of this._tabs) {
			const isActive = tab.id === this._activeTabId;
			const button = append(this._tabStrip, $('button.swarm-terminal-view-tab')) as HTMLButtonElement;
			button.type = 'button';
			button.classList.toggle('swarm-terminal-view-tab-active', isActive);
			button.setAttribute('aria-pressed', String(isActive));
			button.setAttribute('aria-label', localize('swarm.terminalView.tabLabel', "Terminal: {0}", tab.title));
			const icon = append(button, $('span.swarm-terminal-view-tabIcon'));
			icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.terminal));
			const label = append(button, $('span.swarm-terminal-view-tabLabel'));
			label.textContent = tab.title;
			this._renderStore.add(addDisposableListener(button, 'click', () => this._setActiveTab(tab.id)));
		}

		const addButton = append(this._tabStrip, $('button.swarm-terminal-view-addTab')) as HTMLButtonElement;
		addButton.type = 'button';
		addButton.setAttribute('aria-label', localize('swarm.terminalView.newTab', "New Terminal"));
		const addIcon = append(addButton, $('span.swarm-terminal-view-addTabIcon'));
		addIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.add));

		const activeTab = this._tabs.find(tab => tab.id === this._activeTabId) ?? this._tabs[0];
		for (const line of activeTab.lines) {
			this._appendLine(line);
		}
	}

	private _appendLine(line: ISwarmTerminalLine): void {
		const row = append(this._body, $('.swarm-terminal-view-line'));
		row.classList.add(`swarm-terminal-view-line-${line.type}`);
		const prefix = LINE_PREFIX[line.type];
		if (prefix) {
			const prefixElement = append(row, $('span.swarm-terminal-view-linePrefix'));
			prefixElement.textContent = prefix;
		}
		const text = append(row, $('span.swarm-terminal-view-lineText'));
		text.textContent = line.text;
	}

	private _setActiveTab(tabId: string): void {
		if (this._activeTabId === tabId) {
			return;
		}

		this._activeTabId = tabId;
		this._render();
	}

	private _submitCommand(): void {
		const command = this._promptInput.value.trim();
		if (!command) {
			return;
		}

		this._promptInput.value = '';
		this._onDidSubmitCommand.fire({ tabId: this._activeTabId, command });
	}
}
