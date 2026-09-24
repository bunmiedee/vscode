/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentGridModePart.css';
import { $, append, isHTMLElement } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { SwarmApp } from './swarmApp.js';

/**
 * The workbench outlet for the swarm application.
 *
 * This part is a thin host: it owns the full-window surface element and mounts
 * the swarm app ({@link SwarmApp}) inside it. All swarm layout lives in the
 * swarm project under `vs/workbench/contrib/swarm`; this part only decides when
 * the surface is shown or hidden.
 *
 * The surface deliberately does NOT draw its own title bar. The native
 * workbench title bar stays visible above it (that is where the Agent Grid
 * Mode toggle lives), so the surface only owns the area below it.
 */
export class AgentGridModePart extends Disposable {

	private readonly _element: HTMLElement;
	private readonly _swarmApp: SwarmApp;
	private _visible = false;
	private readonly _activityBarLabelClasses = new WeakMap<HTMLElement, string>();
	private _wasSidebarVisible = false;
	private _wasAuxiliaryBarVisible = false;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super();

		this._element = $('.agent-grid-mode-surface');
		this._element.setAttribute('role', 'region');
		this._element.setAttribute('aria-label', localize('agentGridMode.surfaceLabel', "Agent Grid Mode"));

		this._swarmApp = this._register(instantiationService.createInstance(SwarmApp));
		this._element.appendChild(this._swarmApp.element);
		this._register(this.layoutService.onDidLayoutMainContainer(() => {
			this._mount();
			if (this._visible) {
				this._updateWorkbenchPartsVisibility(true);
				this._updateActivityBarIcons(true);
			}
		}));
		this._mount();
		this.logService.info('[AgentGridMode] part created', { childCount: this._element.childElementCount });

		this.setVisible(false);
	}

	get element(): HTMLElement {
		return this._element;
	}

	isVisible(): boolean {
		return this._visible;
	}

	setVisible(visible: boolean): void {
		if (this._visible === visible) {
			return;
		}

		this._visible = visible;
		this._element.classList.toggle('visible', visible);
		this._element.setAttribute('aria-hidden', String(!visible));
		this.layoutService.mainContainer.classList.toggle('agent-grid-mode-active', visible);
		this._updateWorkbenchPartsVisibility(visible);
		this._updateActivityBarIcons(visible);
		this.logService.info('[AgentGridMode] part visibility set', { visible, className: this._element.className });
	}

	private _mount(): void {
		const editorContent = this.layoutService.getContainer(mainWindow, Parts.EDITOR_PART)?.firstElementChild;
		if (!editorContent) {
			return;
		}

		let didMount = false;

		if (!this._element.isConnected) {
			append(editorContent, this._element);
			didMount = true;
		}

		if (didMount) {
			this.logService.info('[AgentGridMode] part mounted');
		}
	}

	private _updateActivityBarIcons(visible: boolean): void {
		const activityBarContent = this.layoutService.getContainer(mainWindow, Parts.ACTIVITYBAR_PART)?.firstElementChild;
		if (!activityBarContent) {
			return;
		}

		const topItemCount = this._swarmApp.activityItems.filter(item => item.group === 'top').length;
		const bottomItemCount = this._swarmApp.activityItems.filter(item => item.group === 'bottom').length;
		const topLabels = this._collectActionLabels(activityBarContent, topItemCount);
		const bottomLabels = this._collectActionLabels(activityBarContent, bottomItemCount, true);
		const labels = [...topLabels, ...bottomLabels];
		const items = [...this._swarmApp.activityItems.filter(item => item.group === 'top'), ...this._swarmApp.activityItems.filter(item => item.group === 'bottom')];

		for (let index = 0; index < labels.length; index++) {
			const label = labels[index];
			const item = items[index];
			if (!item) {
				continue;
			}

			if (!this._activityBarLabelClasses.has(label)) {
				this._activityBarLabelClasses.set(label, label.className);
			}

			label.className = visible
				? this._replaceActivityBarIconClass(label.className, item.iconId)
				: this._activityBarLabelClasses.get(label) ?? label.className;
		}
	}

	/**
	 * Collects the trailing `action-label` elements of the activity bar's
	 * composite bar (or, when `skipFirst` is set, of the remaining bars).
	 */
	private _collectActionLabels(container: HTMLElement, count: number, skipFirst = false): HTMLElement[] {
		const labels: HTMLElement[] = [];
		const bars = Array.from(container.children).filter((child): child is HTMLElement => isHTMLElement(child));

		for (const bar of skipFirst ? bars.slice(1) : bars.slice(0, 1)) {
			for (const actionBar of bar.children) {
				for (const actionItem of actionBar.children) {
					if (isHTMLElement(actionItem) && actionItem.classList.contains('action-label')) {
						labels.push(actionItem);
					}
				}
			}
		}

		return labels.slice(-count);
	}

	private _replaceActivityBarIconClass(className: string, iconId: string): string {
		const preservedClasses = className
			.split(/\s+/)
			.filter(token => token.length > 0 && (token === 'action-label' || token === 'codicon' || !token.startsWith('codicon-')));

		preservedClasses.push(...ThemeIcon.asClassNameArray(ThemeIcon.fromId(iconId)).filter(token => token !== 'codicon'));
		return Array.from(new Set(preservedClasses)).join(' ');
	}

	private _updateWorkbenchPartsVisibility(visible: boolean): void {
		if (visible) {
			this._wasSidebarVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
			this._wasAuxiliaryBarVisible = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
			this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
			this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			return;
		}

		this.layoutService.setPartHidden(!this._wasSidebarVisible, Parts.SIDEBAR_PART);
		this.layoutService.setPartHidden(!this._wasAuxiliaryBarVisible, Parts.AUXILIARYBAR_PART);
	}
}
