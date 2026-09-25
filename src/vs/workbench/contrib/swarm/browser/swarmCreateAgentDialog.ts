/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/swarmCreateAgentDialog.css';
import { $, addDisposableListener, append, clearNode, getWindow } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';

/** A selectable model in the create-agent dialog. */
export interface ISwarmAgentModelOption {
	readonly id: string;
	readonly label: string;
}

/** A selectable base branch in the create-agent dialog. */
export interface ISwarmAgentBranchOption {
	readonly id: string;
	readonly label: string;
}

/** The repository the new agent will work in. */
export interface ISwarmAgentRepository {
	readonly name: string;
	readonly path: string;
	readonly owner: string;
}

/** The values collected by the create-agent dialog. */
export interface ISwarmCreateAgentResult {
	readonly name: string;
	readonly model: string;
	readonly repository: ISwarmAgentRepository;
	readonly createWorktree: boolean;
	readonly createBranch: boolean;
	readonly branchName: string;
	readonly baseBranch: string;
	readonly worktreePath: string;
}

/** Options for {@link SwarmCreateAgentDialog}. */
export interface ISwarmCreateAgentDialogOptions {
	readonly models: readonly ISwarmAgentModelOption[];
	readonly branches: readonly ISwarmAgentBranchOption[];
	readonly repository: ISwarmAgentRepository;
	readonly defaultModel?: string;
	readonly defaultBaseBranch?: string;
	readonly defaultWorktreePath?: string;
}

const DEFAULT_MODELS: readonly ISwarmAgentModelOption[] = [
	{ id: 'claude-sonnet-4.5', label: 'claude-sonnet-4.5' },
	{ id: 'gpt-5', label: 'gpt-5' },
	{ id: 'gpt-5-mini', label: 'gpt-5-mini' },
];

const DEFAULT_BRANCHES: readonly ISwarmAgentBranchOption[] = [
	{ id: 'main', label: 'main' },
	{ id: 'develop', label: 'develop' },
];

const DEFAULT_REPOSITORY: ISwarmAgentRepository = {
	name: 'fridays-runtime',
	path: '~/projects/fridays-runtime',
	owner: 'bunmiedee/fridays-runtime',
};

/**
 * The swarm "Create agent" dialog.
 *
 * A modal outlet surfaced by the title bar `+` action. It collects the
 * configuration for a new agent (name, model, project directory, and Git
 * setup) and emits the result when the user confirms.
 *
 * The dialog is currently UI-only: it renders mock options and does not touch
 * real chat or Git state. Wiring it to the agent host is a follow-up.
 */
export class SwarmCreateAgentDialog extends Disposable {

	private readonly _element: HTMLElement;
	private readonly _renderStore = this._register(new DisposableStore());
	private readonly _options: Required<ISwarmCreateAgentDialogOptions>;

	private _nameInput: HTMLInputElement | undefined;

	private _name = '';
	private _model: string;
	private _createWorktree = true;
	private _createBranch = true;
	private _branchName = 'feat/agent-task';
	private _baseBranch: string;
	private _worktreePath: string;
	private _advancedExpanded = false;

	private readonly _onDidSubmit = this._register(new Emitter<ISwarmCreateAgentResult>());
	readonly onDidSubmit: Event<ISwarmCreateAgentResult> = this._onDidSubmit.event;

	private readonly _onDidCancel = this._register(new Emitter<void>());
	readonly onDidCancel: Event<void> = this._onDidCancel.event;

	constructor(options: ISwarmCreateAgentDialogOptions) {
		super();

		this._options = {
			models: options.models.length ? options.models : DEFAULT_MODELS,
			branches: options.branches.length ? options.branches : DEFAULT_BRANCHES,
			repository: options.repository,
			defaultModel: options.defaultModel ?? DEFAULT_MODELS[0].id,
			defaultBaseBranch: options.defaultBaseBranch ?? DEFAULT_BRANCHES[0].id,
			defaultWorktreePath: options.defaultWorktreePath ?? '~/wt/fridays/new-agent',
		};
		this._model = this._options.defaultModel;
		this._baseBranch = this._options.defaultBaseBranch;
		this._worktreePath = this._options.defaultWorktreePath;

		this._element = $('.swarm-create-agent-overlay');
		this._element.setAttribute('role', 'dialog');
		this._element.setAttribute('aria-modal', 'true');
		this._element.setAttribute('aria-label', localize('swarm.createAgent.label', "Create agent"));

		this._render();
	}

	get element(): HTMLElement {
		return this._element;
	}

	/** Moves focus into the dialog (the name field). */
	focus(): void {
		this._nameInput?.focus();
	}

	override dispose(): void {
		this._element.remove();
		super.dispose();
	}

	private _render(): void {
		this._renderStore.clear();
		clearNode(this._element);
		this._nameInput = undefined;

		const backdrop = append(this._element, $('.swarm-create-agent-backdrop'));
		this._renderStore.add(addDisposableListener(backdrop, 'mousedown', () => this._cancel()));

		const dialog = append(this._element, $('.swarm-create-agent-dialog'));
		dialog.setAttribute('role', 'document');
		this._renderStore.add(addDisposableListener(dialog, 'mousedown', e => e.stopPropagation()));

		this._renderHeader(dialog);
		const body = append(dialog, $('.swarm-create-agent-body'));
		this._renderAgentSection(body);
		this._renderProjectSection(body);
		this._renderGitSection(body);
		this._renderAdvancedSection(body);
		this._renderFooter(dialog);

		this._renderStore.add(addDisposableListener(this._element, 'keydown', e => {
			if (e.key === 'Escape') {
				e.preventDefault();
				this._cancel();
			} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				this._submit();
			}
		}));
	}

	private _renderHeader(dialog: HTMLElement): void {
		const header = append(dialog, $('.swarm-create-agent-header'));
		const heading = append(header, $('.swarm-create-agent-heading'));
		const eyebrow = append(heading, $('span.swarm-create-agent-eyebrow'));
		eyebrow.textContent = localize('swarm.createAgent.eyebrow', "New Session");
		const title = append(heading, $('h2.swarm-create-agent-title'));
		title.textContent = localize('swarm.createAgent.title', "Create agent");
		const subtitle = append(heading, $('p.swarm-create-agent-subtitle'));
		subtitle.textContent = localize('swarm.createAgent.subtitle', "Choose where it works, then configure its Git context.");

		const close = append(header, $('button.swarm-create-agent-close')) as HTMLButtonElement;
		close.type = 'button';
		close.setAttribute('aria-label', localize('swarm.createAgent.close', "Close"));
		this._appendIcon(close, Codicon.close);
		this._renderStore.add(addDisposableListener(close, 'click', () => this._cancel()));
	}

	private _renderAgentSection(body: HTMLElement): void {
		const section = append(body, $('.swarm-create-agent-section'));
		this._appendSectionLabel(section, localize('swarm.createAgent.agentSection', "Agent"));

		const row = append(section, $('.swarm-create-agent-fieldRow'));

		const nameField = append(row, $('.swarm-create-agent-field'));
		this._appendFieldLabel(nameField, localize('swarm.createAgent.name', "Name"));
		const nameInput = append(nameField, $('input.swarm-create-agent-nameInput')) as HTMLInputElement;
		nameInput.type = 'text';
		nameInput.placeholder = localize('swarm.createAgent.namePlaceholder', "e.g. api-refactor");
		nameInput.value = this._name;
		this._nameInput = nameInput;
		this._renderStore.add(addDisposableListener(nameInput, 'input', () => {
			this._name = nameInput.value;
		}));

		const modelField = append(row, $('.swarm-create-agent-field'));
		this._appendFieldLabel(modelField, localize('swarm.createAgent.model', "Model"));
		this._appendSelect(modelField, this._options.models, this._model, value => {
			this._model = value;
		});
	}

	private _renderProjectSection(body: HTMLElement): void {
		const section = append(body, $('.swarm-create-agent-section'));
		const labelRow = append(section, $('.swarm-create-agent-sectionLabelRow'));
		this._appendSectionLabel(labelRow, localize('swarm.createAgent.projectSection', "Project Directory"));

		const choose = append(labelRow, $('button.swarm-create-agent-linkButton')) as HTMLButtonElement;
		choose.type = 'button';
		this._appendIcon(choose, Codicon.folderOpened);
		const chooseLabel = append(choose, $('span'));
		chooseLabel.textContent = localize('swarm.createAgent.chooseDirectory', "Choose directory");
		this._appendIcon(choose, Codicon.chevronDown);

		const repo = append(section, $('.swarm-create-agent-repoCard'));
		const repoIcon = append(repo, $('.swarm-create-agent-repoIcon'));
		this._appendIcon(repoIcon, Codicon.repo);
		const repoInfo = append(repo, $('.swarm-create-agent-repoInfo'));
		const repoName = append(repoInfo, $('span.swarm-create-agent-repoName'));
		repoName.textContent = this._options.repository.name;
		const repoPath = append(repoInfo, $('span.swarm-create-agent-repoPath'));
		repoPath.textContent = this._options.repository.path;
		const repoOwner = append(repo, $('span.swarm-create-agent-repoOwner'));
		repoOwner.textContent = this._options.repository.owner;
	}

	private _renderGitSection(body: HTMLElement): void {
		const card = append(body, $('.swarm-create-agent-card'));

		const header = append(card, $('.swarm-create-agent-cardHeader'));
		const headerIcon = append(header, $('.swarm-create-agent-cardIcon'));
		this._appendIcon(headerIcon, Codicon.gitBranch);
		const headerText = append(header, $('.swarm-create-agent-cardHeaderText'));
		const headerTitle = append(headerText, $('span.swarm-create-agent-cardTitle'));
		headerTitle.textContent = localize('swarm.createAgent.gitSetup', "Git setup");
		const headerSubtitle = append(headerText, $('span.swarm-create-agent-cardSubtitle'));
		headerSubtitle.textContent = localize('swarm.createAgent.gitSetupHint', "Give this agent an isolated place to make changes.");

		const worktreeToggle = append(header, $('label.swarm-create-agent-checkbox'));
		const worktreeInput = append(worktreeToggle, $('input')) as HTMLInputElement;
		worktreeInput.type = 'checkbox';
		worktreeInput.checked = this._createWorktree;
		const worktreeLabel = append(worktreeToggle, $('span'));
		worktreeLabel.textContent = localize('swarm.createAgent.createWorktree', "Create worktree");
		this._renderStore.add(addDisposableListener(worktreeInput, 'change', () => {
			this._createWorktree = worktreeInput.checked;
			this._render();
		}));

		const divider = append(card, $('.swarm-create-agent-divider'));

		const branchToggle = append(card, $('label.swarm-create-agent-checkbox'));
		const branchInput = append(branchToggle, $('input')) as HTMLInputElement;
		branchInput.type = 'checkbox';
		branchInput.checked = this._createBranch;
		const branchLabel = append(branchToggle, $('span'));
		branchLabel.textContent = localize('swarm.createAgent.createBranch', "Create a new branch");
		this._renderStore.add(addDisposableListener(branchInput, 'change', () => {
			this._createBranch = branchInput.checked;
			this._render();
		}));

		const row = append(card, $('.swarm-create-agent-fieldRow'));

		const branchField = append(row, $('.swarm-create-agent-field'));
		this._appendFieldLabel(branchField, localize('swarm.createAgent.branchName', "Branch name"));
		const branchNameWrap = append(branchField, $('.swarm-create-agent-inputWithIcon'));
		const branchIcon = append(branchNameWrap, $('.swarm-create-agent-inputIcon'));
		this._appendIcon(branchIcon, Codicon.gitBranch);
		const branchNameInput = append(branchNameWrap, $('input')) as HTMLInputElement;
		branchNameInput.type = 'text';
		branchNameInput.value = this._branchName;
		branchNameInput.disabled = !this._createBranch;
		this._renderStore.add(addDisposableListener(branchNameInput, 'input', () => {
			this._branchName = branchNameInput.value;
		}));

		const baseField = append(row, $('.swarm-create-agent-field'));
		this._appendFieldLabel(baseField, localize('swarm.createAgent.baseBranch', "Base branch"));
		this._appendSelect(baseField, this._options.branches, this._baseBranch, value => {
			this._baseBranch = value;
		}, !this._createBranch);

		const worktreeRow = append(card, $('.swarm-create-agent-worktreeRow'));
		const worktreeIcon = append(worktreeRow, $('.swarm-create-agent-inputIcon'));
		this._appendIcon(worktreeIcon, Codicon.folder);
		const worktreeLabelText = append(worktreeRow, $('span.swarm-create-agent-worktreeLabel'));
		worktreeLabelText.textContent = localize('swarm.createAgent.worktreePath', "Worktree path");
		const worktreeValue = append(worktreeRow, $('span.swarm-create-agent-worktreeValue'));
		worktreeValue.textContent = this._worktreePath;
	}

	private _renderAdvancedSection(body: HTMLElement): void {
		const card = append(body, $('.swarm-create-agent-card.swarm-create-agent-advanced'));

		const header = append(card, $('button.swarm-create-agent-advancedHeader')) as HTMLButtonElement;
		header.type = 'button';
		header.setAttribute('aria-expanded', String(this._advancedExpanded));
		const headerText = append(header, $('.swarm-create-agent-cardHeaderText'));
		const headerTitle = append(headerText, $('span.swarm-create-agent-cardTitle'));
		headerTitle.textContent = localize('swarm.createAgent.advanced', "Advanced options");
		const headerSubtitle = append(headerText, $('span.swarm-create-agent-cardSubtitle'));
		headerSubtitle.textContent = localize('swarm.createAgent.advancedHint', "Tools, skills, and agent pairing");
		const chevron = append(header, $('.swarm-create-agent-advancedChevron'));
		this._appendIcon(chevron, this._advancedExpanded ? Codicon.chevronUp : Codicon.chevronDown);
		this._renderStore.add(addDisposableListener(header, 'click', () => {
			this._advancedExpanded = !this._advancedExpanded;
			this._render();
		}));

		if (this._advancedExpanded) {
			const content = append(card, $('.swarm-create-agent-advancedContent'));
			const hint = append(content, $('p.swarm-create-agent-advancedPlaceholder'));
			hint.textContent = localize('swarm.createAgent.advancedPlaceholder', "Tool, skill, and pairing configuration will appear here.");
		}
	}

	private _renderFooter(dialog: HTMLElement): void {
		const footer = append(dialog, $('.swarm-create-agent-footer'));
		const hint = append(footer, $('span.swarm-create-agent-footerHint'));
		hint.textContent = localize('swarm.createAgent.footerHint', "You can change agent settings later.");

		const actions = append(footer, $('.swarm-create-agent-footerActions'));

		const cancel = append(actions, $('button.swarm-create-agent-button')) as HTMLButtonElement;
		cancel.type = 'button';
		cancel.textContent = localize('swarm.createAgent.cancel', "Cancel");
		this._renderStore.add(addDisposableListener(cancel, 'click', () => this._cancel()));

		const create = append(actions, $('button.swarm-create-agent-button.swarm-create-agent-buttonPrimary')) as HTMLButtonElement;
		create.type = 'button';
		this._appendIcon(create, Codicon.add);
		const createLabel = append(create, $('span'));
		createLabel.textContent = localize('swarm.createAgent.create', "Create agent");
		this._renderStore.add(addDisposableListener(create, 'click', () => this._submit()));
	}

	private _appendSectionLabel(container: HTMLElement, text: string): void {
		const label = append(container, $('span.swarm-create-agent-sectionLabel'));
		label.textContent = text;
	}

	private _appendFieldLabel(container: HTMLElement, text: string): void {
		const label = append(container, $('span.swarm-create-agent-fieldLabel'));
		label.textContent = text;
	}

	private _appendSelect(container: HTMLElement, options: readonly { readonly id: string; readonly label: string }[], value: string, onChange: (value: string) => void, disabled = false): void {
		const select = append(container, $('select.swarm-create-agent-select')) as HTMLSelectElement;
		select.disabled = disabled;
		for (const option of options) {
			const optionElement = append(select, $('option')) as HTMLOptionElement;
			optionElement.value = option.id;
			optionElement.textContent = option.label;
			optionElement.selected = option.id === value;
		}
		this._renderStore.add(addDisposableListener(select, 'change', () => onChange(select.value)));
	}

	private _appendIcon(container: HTMLElement, icon: typeof Codicon.repo): void {
		const iconElement = append(container, $('span.swarm-create-agent-icon'));
		iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
	}

	private _submit(): void {
		this._onDidSubmit.fire({
			name: this._name.trim(),
			model: this._model,
			repository: this._options.repository,
			createWorktree: this._createWorktree,
			createBranch: this._createBranch,
			branchName: this._branchName.trim(),
			baseBranch: this._baseBranch,
			worktreePath: this._worktreePath,
		});
	}

	private _cancel(): void {
		this._onDidCancel.fire();
	}
}

/**
 * Shows the create-agent dialog as a modal overlay on top of the given host
 * element. Returns a disposable that removes the dialog.
 */
export function showSwarmCreateAgentDialog(host: HTMLElement, options: ISwarmCreateAgentDialogOptions, onResult: (result: ISwarmCreateAgentResult) => void): Disposable {
	const store = new DisposableStore();
	const dialog = store.add(new SwarmCreateAgentDialog(options));
	append(host, dialog.element);

	store.add(dialog.onDidSubmit(result => {
		onResult(result);
		store.dispose();
	}));
	store.add(dialog.onDidCancel(() => store.dispose()));

	const window = getWindow(host);
	store.add(addDisposableListener(window, 'keydown', e => {
		if (e.key === 'Escape') {
			e.preventDefault();
			store.dispose();
		}
	}));

	dialog.focus();
	return store;
}
