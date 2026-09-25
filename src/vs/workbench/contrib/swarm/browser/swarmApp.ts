/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/swarmApp.css';
import { $, addDisposableListener, append, clearNode, getActiveElement, getWindow, isHTMLElement } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { IAgentHostEnablementService } from '../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ChatAgentLocation, ChatModeKind, getDefaultNewChatSessionTypeAndReasonFromServices } from '../../chat/common/constants.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { IChatModel } from '../../chat/common/model/chatModel.js';
import { IChatModelReference, IChatService } from '../../chat/common/chatService/chatService.js';
import { IChatSessionsService, localChatSessionType, SessionType } from '../../chat/common/chatSessionsService.js';
import { getNewChatSessionResource } from '../../chat/common/model/chatUri.js';
import { ChatWidget } from '../../chat/browser/widget/chatWidget.js';
import { ISwarmActivityItem, ISwarmAppInfo, SwarmView } from '../common/swarm.js';
import { SwarmCodeView } from './swarmCodeView.js';
import { getSeedDiffsForPreset } from './swarmCodeViewData.js';
import { SwarmTerminalView } from './swarmTerminalView.js';
import { ISwarmCreateAgentResult, showSwarmCreateAgentDialog } from './swarmCreateAgentDialog.js';

interface ISwarmChatCell {
	readonly container: HTMLElement;
	readonly widget: ChatWidget;
	readonly model: IChatModel | undefined;
}

/** Which face of a swarm chat window is showing. */
const enum SwarmChatFace {
	Chat = 'chat',
	Code = 'code',
	Terminal = 'terminal',
}

interface ISwarmChatWindowPreset {
	readonly title: string;
	readonly status: string;
	readonly repository: string;
	readonly mode: string;
	readonly branch: string;
	readonly autoCommit: boolean;
}

const SWARM_CHAT_PRESETS: readonly ISwarmChatWindowPreset[] = [
	{ title: 'auth-refactor', status: 'Idle', repository: 'fridays-runtime', mode: 'session', branch: 'feat/session-rotation', autoCommit: true },
	{ title: 'planner', status: 'Ready', repository: 'fridays-runtime', mode: 'spec', branch: 'feat/swarm-grid', autoCommit: false },
	{ title: 'codegen', status: 'Working', repository: 'fridays-runtime', mode: 'implement', branch: 'feat/chat-shell', autoCommit: false },
	{ title: 'review', status: 'Waiting', repository: 'fridays-runtime', mode: 'review', branch: 'feat/chat-shell', autoCommit: false },
];

/**
 * The swarm application.
 *
 * This is the real home of the concurrent-agents surface. It owns the layout
 * *inside* the editor area handed to it by the workbench and exposes a small contract
 * ({@link ISwarmAppInfo}) that the workbench outlet consumes.
 *
 * The workbench keeps owning the title bar, activity bar, and status bar. This
 * surface only replaces the editor area.
 */
export class SwarmApp extends Disposable implements ISwarmAppInfo {

	private readonly _element: HTMLElement;
	private readonly _chatCells = this._register(new DisposableStore());
	private readonly _renderedCells: ISwarmChatCell[] = [];
	private readonly _createAgentDialog = this._register(new MutableDisposable<IDisposable>());
	private _grid: HTMLElement | undefined;

	private _activeView: SwarmView = SwarmView.Agents;

	private readonly _onDidChangeActiveView = this._register(new Emitter<SwarmView>());
	readonly onDidChangeActiveView: Event<SwarmView> = this._onDidChangeActiveView.event;

	readonly activityItems: readonly ISwarmActivityItem[] = [
		{ id: SwarmView.Agents, label: localize('swarm.view.agents', "Agents"), iconId: 'layout', group: 'top' },
		{ id: SwarmView.Models, label: localize('swarm.view.models', "Models"), iconId: 'hubot', group: 'top' },
		{ id: SwarmView.SourceControl, label: localize('swarm.view.sourceControl', "Source Control"), iconId: 'git-branch', group: 'top' },
		{ id: SwarmView.Notifications, label: localize('swarm.view.notifications', "Notifications"), iconId: 'bell', group: 'top' },
		{ id: SwarmView.Terminals, label: localize('swarm.view.terminals', "Terminals"), iconId: 'terminal', group: 'top' },
		{ id: SwarmView.Account, label: localize('swarm.view.account', "Account"), iconId: 'account', group: 'bottom' },
		{ id: SwarmView.Settings, label: localize('swarm.view.settings', "Settings"), iconId: 'settings-gear', group: 'bottom' },
	];

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IAgentHostEnablementService private readonly agentHostEnablementService: IAgentHostEnablementService,
	) {
		super();

		this._element = $('.swarm-app');
		this._element.setAttribute('role', 'region');
		this._element.setAttribute('aria-label', localize('swarm.appLabel', "Swarm"));
		this._renderContent();
	}

	get element(): HTMLElement {
		return this._element;
	}

	get activeView(): SwarmView {
		return this._activeView;
	}

	setActiveView(view: SwarmView): void {
		if (this._activeView === view) {
			return;
		}

		this._activeView = view;
		this._renderContent();
		this._onDidChangeActiveView.fire(view);
	}

	private _renderContent(): void {
		this._chatCells.clear();
		this._renderedCells.length = 0;
		clearNode(this._element);

		const grid = append(this._element, $('main.swarm-agent-grid'));
		grid.setAttribute('aria-label', localize('swarm.gridLabel', "Agent chat grid"));
		this._grid = grid;

		for (let index = 0; index < 4; index++) {
			const preset = SWARM_CHAT_PRESETS[index % SWARM_CHAT_PRESETS.length];
			this._appendChatCell(grid, preset);
		}

		const resizeObserver = new (getWindow(this._element).ResizeObserver)(() => this._layoutChatCells());
		resizeObserver.observe(grid);
		this._chatCells.add(toDisposable(() => resizeObserver.disconnect()));
		this._layoutChatCells();
	}

	/**
	 * Appends a single agent chat cell (chrome + chat widget + code view) to the
	 * grid. Shared by the initial render and {@link addChat} so a newly added
	 * chat is indistinguishable from the seeded ones.
	 */
	private _appendChatCell(grid: HTMLElement, preset: ISwarmChatWindowPreset): void {
		const index = this._renderedCells.length;
		const cell = append(grid, $('section.swarm-agent-grid-cell'));
		cell.setAttribute('role', 'group');
		cell.setAttribute('aria-label', localize('swarm.cellLabel', "Agent Chat {0}: {1}", index + 1, preset.title));

		const viewPane = append(cell, $('.swarm-chat-viewpane.chat-viewpane'));
		const controlsWrapper = append(viewPane, $('.voice-agent-controls-wrapper'));
		const widgetHost = append(controlsWrapper, $('.chat-controls-container.swarm-agent-grid-chatWidget'));
		const codeViewHost = append(viewPane, $('.swarm-code-view-host'));
		const terminalViewHost = append(viewPane, $('.swarm-terminal-view-host'));
		const terminalView = this._createTerminalView(terminalViewHost);
		this._renderChatWindowChrome(viewPane, preset, controlsWrapper, codeViewHost, terminalViewHost, terminalView);
		this._createChatCell(widgetHost);
		this._createCodeView(codeViewHost, preset);
	}

	/**
	 * Adds a new agent chat to the grid. The new cell is appended after the
	 * existing ones and the grid is re-laid out so it takes its place.
	 */
	addChat(): void {
		this.showCreateAgentDialog();
	}

	/**
	 * Surfaces the "Create agent" dialog. On confirm, a new agent chat cell is
	 * appended to the grid using the collected configuration.
	 */
	showCreateAgentDialog(): void {
		if (this._createAgentDialog.value) {
			return;
		}

		const preset = SWARM_CHAT_PRESETS[this._renderedCells.length % SWARM_CHAT_PRESETS.length];
		const dialog = showSwarmCreateAgentDialog(
			this._element,
			{
				models: [],
				branches: [],
				repository: {
					name: preset.repository,
					path: '~/projects/fridays-runtime',
					owner: 'bunmiedee/fridays-runtime',
				},
			},
			result => this._addChatFromResult(result),
		);
		// Clear the holder once the dialog is dismissed so it can be reopened.
		this._createAgentDialog.value = dialog;
		dialog.add(toDisposable(() => {
			if (this._createAgentDialog.value === dialog) {
				this._createAgentDialog.clearAndLeak();
			}
		}));
	}

	private _addChatFromResult(result: ISwarmCreateAgentResult): void {
		const grid = this._grid;
		if (!grid) {
			return;
		}

		const preset = SWARM_CHAT_PRESETS[this._renderedCells.length % SWARM_CHAT_PRESETS.length];
		const nextPreset: ISwarmChatWindowPreset = {
			...preset,
			title: result.name || preset.title,
			repository: result.repository.name,
			branch: result.createBranch && result.branchName ? result.branchName : preset.branch,
		};
		this._appendChatCell(grid, nextPreset);
		this._layoutChatCells();
	}

	private _createChatCell(container: HTMLElement): void {
		const scopedContextKeyService = this._chatCells.add(this.contextKeyService.createScoped(container));
		ChatContextKeys.swarmComposer.bindTo(scopedContextKeyService).set(true);
		const scopedInstantiationService = this._chatCells.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
		const widget = this._chatCells.add(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			{},
			{
				autoScroll: mode => mode !== ChatModeKind.Ask,
				renderInputOnTop: false,
				renderFollowups: true,
				supportsFileReferences: true,
				swarmComposer: true,
				rendererOptions: {
					renderTextEditsAsSummary: () => true,
					referencesExpandedWhenEmptyResponse: false,
					progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
				},
				enableImplicitContext: true,
				enableWorkingSet: 'explicit',
				supportsChangingModes: true,
			},
			{
				listForeground: 'var(--vscode-sideBar-foreground)',
				listBackground: 'var(--vscode-sideBar-background)',
				overlayBackground: 'var(--vscode-editorWidget-background)',
				inputEditorBackground: 'var(--vscode-sideBar-background)',
				resultEditorBackground: 'var(--vscode-editor-background)',
			}
		));
		widget.render(container);
		widget.setVisible(true);

		let active = true;
		let model: IChatModel | undefined;
		void this._acquireDefaultChatSession().then(modelRef => {
			if (!modelRef) {
				return;
			}

			if (!active) {
				modelRef.dispose();
				return;
			}

			this._chatCells.add(modelRef);
			model = modelRef.object;
			if (model) {
				widget.setModel(model);
			}
		});

		this._renderedCells.push({ container, widget, model });
		this._chatCells.add(toDisposable(() => {
			active = false;
			widget.setModel(undefined);
		}));

		this._chatCells.add(toDisposable(() => {
			const index = this._renderedCells.findIndex(cell => cell.widget === widget);
			if (index >= 0) {
				this._renderedCells.splice(index, 1);
			}
		}));

		this._chatCells.add(toDisposable(() => {
			const activeElement = getActiveElement();
			if (isHTMLElement(activeElement) && container.contains(activeElement)) {
				widget.focusInput();
			}
		}));
	}

	private _createCodeView(container: HTMLElement, preset: ISwarmChatWindowPreset): void {
		const codeView = this._chatCells.add(new SwarmCodeView(getSeedDiffsForPreset(preset.title)));
		append(container, codeView.element);
	}

	private _createTerminalView(container: HTMLElement): SwarmTerminalView {
		const terminalView = this._chatCells.add(this.instantiationService.createInstance(SwarmTerminalView));
		append(container, terminalView.element);
		return terminalView;
	}

	private async _acquireDefaultChatSession(): Promise<IChatModelReference | undefined> {
		const agentHostEnabled = this.agentHostEnablementService.enabled.get();
		const workspace = this.workspaceContextService.getWorkspace();
		const resolvedSessionType = agentHostEnabled
			? { sessionType: SessionType.AgentHostCopilot, selectionReason: 'computedDefault' as const }
			: getDefaultNewChatSessionTypeAndReasonFromServices(
				this.configurationService,
				this.chatSessionsService,
				this.storageService,
				workspace,
				agentHostEnabled,
				undefined,
				this.agentHostEnablementService.managedSandboxEnforced.get(),
			);

		if (resolvedSessionType.sessionType === localChatSessionType) {
			return this.chatService.startNewLocalSession(ChatAgentLocation.Chat, {
				disableBackgroundKeepAlive: true,
				debugOwner: 'SwarmApp#createChatCell',
				sessionTypeSelectionReason: resolvedSessionType.selectionReason,
			});
		}

		const sessionResource = getNewChatSessionResource(resolvedSessionType.sessionType);
		try {
			return await this.chatService.acquireOrLoadSession(
				sessionResource,
				ChatAgentLocation.Chat,
				CancellationToken.None,
				'SwarmApp#createChatCell',
				resolvedSessionType.selectionReason,
			);
		} catch {
			return this.chatService.startNewLocalSession(ChatAgentLocation.Chat, {
				disableBackgroundKeepAlive: true,
				debugOwner: 'SwarmApp#createChatCell:fallbackLocal',
				sessionTypeSelectionReason: resolvedSessionType.selectionReason,
			});
		}
	}

	private _renderChatWindowChrome(container: HTMLElement, preset: ISwarmChatWindowPreset, chatPane: HTMLElement, codePane: HTMLElement, terminalPane: HTMLElement, terminalView: SwarmTerminalView): void {
		// The header must be the first child of the pane so it renders above the
		// chat/code faces, which are appended before this method runs.
		const header = $('.swarm-chat-window-header');
		container.prepend(header);
		const titleRow = append(header, $('.swarm-chat-window-titleRow'));
		const titleGroup = append(titleRow, $('.swarm-chat-window-titleGroup'));
		append(titleGroup, $('.swarm-chat-window-titleDot'));
		const title = append(titleGroup, $('span.swarm-chat-window-title'));
		title.textContent = preset.title;

		const controls = append(titleRow, $('.swarm-chat-window-controls'));
		const status = append(controls, $('span.swarm-chat-window-status'));
		status.textContent = preset.status;

		const segmented = append(controls, $('.swarm-chat-window-segmentedActions'));
		const setFace = (face: SwarmChatFace) => {
			const showChat = face === SwarmChatFace.Chat;
			const showCode = face === SwarmChatFace.Code;
			const showTerminal = face === SwarmChatFace.Terminal;
			chatPane.classList.toggle('swarm-chat-face-hidden', !showChat);
			codePane.classList.toggle('swarm-chat-face-hidden', !showCode);
			terminalPane.classList.toggle('swarm-chat-face-hidden', !showTerminal);
			chatButton.classList.toggle('swarm-chat-window-iconButton-active', showChat);
			codeButton.classList.toggle('swarm-chat-window-iconButton-active', showCode);
			terminalButton.classList.toggle('swarm-chat-window-iconButton-active', showTerminal);
			chatButton.setAttribute('aria-pressed', String(showChat));
			codeButton.setAttribute('aria-pressed', String(showCode));
			terminalButton.setAttribute('aria-pressed', String(showTerminal));
			terminalView.setVisible(showTerminal);
			if (showTerminal) {
				terminalView.layout({ width: terminalPane.clientWidth, height: terminalPane.clientHeight });
			}
		};
		const chatButton = this._appendIconButton(segmented, Codicon.commentDiscussion, localize('swarm.chatAction.chat', "Chat"));
		const codeButton = this._appendIconButton(segmented, Codicon.code, localize('swarm.chatAction.code', "Code"));
		const terminalButton = this._appendIconButton(segmented, Codicon.terminal, localize('swarm.chatAction.terminal', "Terminal"));
		this._chatCells.add(addDisposableListener(chatButton, 'click', () => setFace(SwarmChatFace.Chat)));
		this._chatCells.add(addDisposableListener(codeButton, 'click', () => setFace(SwarmChatFace.Code)));
		this._chatCells.add(addDisposableListener(terminalButton, 'click', () => setFace(SwarmChatFace.Terminal)));
		setFace(SwarmChatFace.Chat);

		this._appendIconButton(controls, Codicon.screenFull, localize('swarm.chatAction.maximize', "Maximize"));
		this._appendIconButton(controls, Codicon.settingsGear, localize('swarm.chatAction.settings', "Settings"));
		this._appendIconButton(controls, Codicon.close, localize('swarm.chatAction.close', "Close"));

		const contextRow = append(header, $('.swarm-chat-window-contextRow'));
		const contextGroup = append(contextRow, $('.swarm-chat-window-contextGroup'));
		this._appendContextPill(contextGroup, Codicon.repo, preset.repository);
		this._appendContextPill(contextGroup, Codicon.gitPullRequest, preset.mode);
		this._appendContextPill(contextGroup, Codicon.gitBranch, preset.branch);

		const autoCommit = append(contextRow, $('label.swarm-chat-window-checkbox'));
		const checkbox = append(autoCommit, $('input')) as HTMLInputElement;
		checkbox.type = 'checkbox';
		checkbox.checked = preset.autoCommit;
		checkbox.disabled = true;
		const checkboxLabel = append(autoCommit, $('span'));
		checkboxLabel.textContent = localize('swarm.autoCommit', "auto-commit");
	}

	private _appendContextPill(container: HTMLElement, icon: typeof Codicon.repo, label: string): void {
		const pill = append(container, $('.swarm-chat-window-pill'));
		this._appendIcon(pill, icon);
		const text = append(pill, $('span'));
		text.textContent = label;
		this._appendIcon(pill, Codicon.chevronDown);
	}

	private _appendIconButton(container: HTMLElement, icon: typeof Codicon.repo, ariaLabel: string): HTMLButtonElement {
		const button = append(container, $('button.swarm-chat-window-iconButton')) as HTMLButtonElement;
		button.type = 'button';
		button.setAttribute('aria-label', ariaLabel);
		this._appendIcon(button, icon);
		return button;
	}

	private _appendIcon(container: HTMLElement, icon: typeof Codicon.repo): void {
		const iconElement = append(container, $('span.swarm-chat-window-icon'));
		iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
	}

	private _layoutChatCells(): void {
		for (const cell of this._renderedCells) {
			const width = cell.container.clientWidth;
			const height = cell.container.clientHeight;
			if (width === 0 || height === 0) {
				continue;
			}

			cell.widget.layout(height, width);
		}
	}
}
