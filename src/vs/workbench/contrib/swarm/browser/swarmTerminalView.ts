/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, clearNode, Dimension } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';

/** A single terminal tab hosted by the swarm terminal view. */
interface ISwarmTerminalTab {
	readonly id: string;
	readonly title: string;
	readonly instance: ITerminalInstance;
}

/**
 * The swarm terminal view.
 *
 * Hosts one or more real, pty-backed terminal instances inside an agent window
 * cell. Each tab owns an {@link ITerminalInstance} created through
 * {@link ITerminalService} and mounted directly into the view via
 * `attachToElement`, so the shell lives only inside the swarm cell and never
 * appears in the Terminal panel.
 *
 * Instances are created lazily: the first tab is spawned the first time the
 * terminal face becomes visible, and additional tabs are spawned on demand.
 */
export class SwarmTerminalView extends Disposable {

	private readonly _element: HTMLElement;
	private readonly _tabStrip: HTMLElement;
	private readonly _body: HTMLElement;
	private readonly _renderStore = this._register(new DisposableStore());
	private readonly _instanceStore = this._register(new DisposableStore());

	private readonly _tabs: ISwarmTerminalTab[] = [];
	private _activeTabId: string | undefined;
	private _visible = false;
	private _lastDimension: Dimension | undefined;

	private readonly _onDidChangeActiveTab = this._register(new Emitter<string>());
	readonly onDidChangeActiveTab: Event<string> = this._onDidChangeActiveTab.event;

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();

		this._element = $('.swarm-terminal-view');
		this._element.setAttribute('role', 'region');
		this._element.setAttribute('aria-label', localize('swarm.terminalView.label', "Terminal"));

		this._tabStrip = append(this._element, $('.swarm-terminal-view-tabStrip'));
		this._body = append(this._element, $('.swarm-terminal-view-body'));

		this._renderTabStrip();
	}

	get element(): HTMLElement {
		return this._element;
	}

	/** The id of the currently active terminal tab, if any. */
	get activeTabId(): string | undefined {
		return this._activeTabId;
	}

	/**
	 * Shows or hides the terminal face. The first time the view becomes visible
	 * the initial shell is spawned; subsequent calls only toggle visibility.
	 */
	setVisible(visible: boolean): void {
		if (this._visible === visible) {
			return;
		}

		this._visible = visible;
		if (visible) {
			this._ensureActiveTab();
			this._activeInstance?.setVisible(true);
			this._layoutActiveInstance();
		} else {
			this._activeInstance?.setVisible(false);
		}
	}

	/** Lays the active terminal out to the given dimension. */
	layout(dimension: Dimension): void {
		this._lastDimension = dimension;
		this._layoutActiveInstance();
	}

	/** Focuses the active terminal instance. */
	focus(): void {
		this._activeInstance?.focus();
	}

	private get _activeInstance(): ITerminalInstance | undefined {
		return this._tabs.find(tab => tab.id === this._activeTabId)?.instance;
	}

	private _layoutActiveInstance(): void {
		if (!this._visible || !this._lastDimension) {
			return;
		}

		const instance = this._activeInstance;
		if (!instance) {
			return;
		}

		instance.layout({ width: this._lastDimension.width, height: this._lastDimension.height });
	}

	/**
	 * Ensures there is an active tab, spawning the initial shell if needed.
	 */
	private _ensureActiveTab(): void {
		if (this._tabs.length === 0) {
			void this._createTab();
			return;
		}

		if (!this._activeTabId) {
			this._setActiveTab(this._tabs[0].id);
		}
	}

	/**
	 * Spawns a new pty-backed terminal instance and mounts it into the body.
	 */
	private async _createTab(): Promise<void> {
		const instance = await this._terminalService.createTerminal({
			location: TerminalLocation.Panel,
		});

		if (this._store.isDisposed) {
			instance.dispose();
			return;
		}

		this._instanceStore.add(instance);

		const tab: ISwarmTerminalTab = {
			id: `swarm-terminal-${instance.instanceId}`,
			title: instance.title || localize('swarm.terminalView.defaultTitle', "Terminal"),
			instance,
		};
		this._tabs.push(tab);

		this._instanceStore.add(instance.onTitleChanged(() => this._renderTabStrip()));

		this._setActiveTab(tab.id);
	}

	private _setActiveTab(tabId: string): void {
		if (this._activeTabId === tabId) {
			return;
		}

		const previous = this._activeInstance;
		if (previous) {
			previous.detachFromElement();
			previous.setVisible(false);
		}

		this._activeTabId = tabId;
		const tab = this._tabs.find(candidate => candidate.id === tabId);
		if (tab) {
			tab.instance.attachToElement(this._body);
			tab.instance.setVisible(this._visible);
			this._layoutActiveInstance();
		}

		this._renderTabStrip();
		this._onDidChangeActiveTab.fire(tabId);
	}

	private _renderTabStrip(): void {
		this._renderStore.clear();
		clearNode(this._tabStrip);

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
		this._renderStore.add(addDisposableListener(addButton, 'click', () => void this._createTab()));
	}
}
