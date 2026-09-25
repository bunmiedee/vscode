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
import { ISwarmDiffLine, ISwarmFileDiff, SwarmDiffLineType, SwarmFileStatus, SwarmReviewVerdict } from '../common/swarm.js';

/** An inline comment anchored to a single line of a file diff. */
interface ISwarmInlineComment {
	readonly id: string;
	readonly text: string;
}

/** The payload emitted when a review is submitted from the code view. */
export interface ISwarmReviewSubmission {
	readonly verdict: SwarmReviewVerdict;
	readonly summary: string;
	readonly commentCount: number;
}

interface IFileStatusMeta {
	readonly icon: typeof Codicon.diffModified;
	readonly className: string;
}

const FILE_STATUS_META: Record<SwarmFileStatus, IFileStatusMeta> = {
	[SwarmFileStatus.Modified]: { icon: Codicon.diffModified, className: 'swarm-code-view-status-modified' },
	[SwarmFileStatus.Added]: { icon: Codicon.diffAdded, className: 'swarm-code-view-status-added' },
	[SwarmFileStatus.Deleted]: { icon: Codicon.diffRemoved, className: 'swarm-code-view-status-deleted' },
};

const VERDICTS: readonly { readonly id: SwarmReviewVerdict; readonly label: string; readonly className: string }[] = [
	{ id: SwarmReviewVerdict.Comment, label: localize('swarm.codeView.verdict.comment', "Comment"), className: 'swarm-code-view-verdict-comment' },
	{ id: SwarmReviewVerdict.Approve, label: localize('swarm.codeView.verdict.approve', "Approve"), className: 'swarm-code-view-verdict-approve' },
	{ id: SwarmReviewVerdict.RequestChanges, label: localize('swarm.codeView.verdict.requestChanges', "Request changes"), className: 'swarm-code-view-verdict-changes' },
];

function lineKey(path: string, index: number): string {
	return `${path}::${index}`;
}

/**
 * The swarm mini code view.
 *
 * Renders a compact, per-file diff with two interactive affordances borrowed
 * from the swarm prototype:
 *
 * - **Inline comments** — hovering a line reveals an "add comment" button that
 *   opens a small editor; saved comments render beneath the line.
 * - **Inline edits** — when {@link ISwarmCodeViewOptions.editable} is set, every
 *   non-deleted line becomes an editable field.
 *
 * The view is currently UI-only: it renders seed diffs and keeps its comment /
 * edit state in memory. Wiring it to real chat or git data is a follow-up.
 */
export class SwarmCodeView extends Disposable {

	private readonly _element: HTMLElement;
	private readonly _body: HTMLElement;
	private readonly _renderStore = this._register(new DisposableStore());

	private readonly _comments = new Map<string, ISwarmInlineComment[]>();
	private readonly _edits = new Map<string, string>();
	private _draftKey: string | undefined;
	private _verdict: SwarmReviewVerdict = SwarmReviewVerdict.Comment;
	private _summary = '';
	private _submitted: ISwarmReviewSubmission | undefined;
	private _editable: boolean;
	private _editCountElement: HTMLElement | undefined;

	private readonly _onDidChangeCommentCount = this._register(new Emitter<number>());
	readonly onDidChangeCommentCount: Event<number> = this._onDidChangeCommentCount.event;

	private readonly _onDidChangeEditCount = this._register(new Emitter<number>());
	readonly onDidChangeEditCount: Event<number> = this._onDidChangeEditCount.event;

	private readonly _onDidSubmitReview = this._register(new Emitter<ISwarmReviewSubmission>());
	readonly onDidSubmitReview: Event<ISwarmReviewSubmission> = this._onDidSubmitReview.event;

	constructor(
		private readonly _diffs: readonly ISwarmFileDiff[],
		options: { readonly editable?: boolean } = {},
	) {
		super();

		this._editable = Boolean(options.editable);

		this._element = $('.swarm-code-view');
		this._element.setAttribute('role', 'region');
		this._element.setAttribute('aria-label', localize('swarm.codeView.label', "Code changes"));

		this._body = append(this._element, $('.swarm-code-view-body'));
		this._render();
	}

	get element(): HTMLElement {
		return this._element;
	}

	get commentCount(): number {
		let count = 0;
		for (const list of this._comments.values()) {
			count += list.length;
		}
		return count;
	}

	/** The number of lines the user has changed from their original text. */
	get editCount(): number {
		let count = 0;
		for (const [key, value] of this._edits) {
			if (value !== this._originalText(key)) {
				count++;
			}
		}
		return count;
	}

	/** Whether the view is currently in inline edit mode. */
	get editable(): boolean {
		return this._editable;
	}

	/** Toggle inline edit mode. Edit mode replaces the review footer. */
	setEditable(editable: boolean): void {
		if (this._editable === editable) {
			return;
		}
		this._editable = editable;
		this._draftKey = undefined;
		this._render();
	}

	private _originalText(key: string): string | undefined {
		const separator = key.lastIndexOf('::');
		if (separator === -1) {
			return undefined;
		}
		const path = key.slice(0, separator);
		const index = Number(key.slice(separator + 2));
		const file = this._diffs.find(f => f.path === path);
		return file?.lines[index]?.text;
	}

	private _render(): void {
		this._renderStore.clear();
		clearNode(this._body);
		this._editCountElement = undefined;

		if (this._diffs.length === 0) {
			const empty = append(this._body, $('p.swarm-code-view-empty'));
			empty.textContent = localize('swarm.codeView.empty', "No changes yet on this worktree.");
			return;
		}

		for (const file of this._diffs) {
			this._renderFile(file);
		}

		this._renderReviewFooter();
	}

	private _renderFile(file: ISwarmFileDiff): void {
		const card = append(this._body, $('.swarm-code-view-file'));
		const header = append(card, $('.swarm-code-view-fileHeader'));

		const meta = FILE_STATUS_META[file.status];
		const icon = append(header, $('span.swarm-code-view-fileIcon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(meta.icon), meta.className);

		const path = append(header, $('span.swarm-code-view-filePath'));
		path.textContent = file.path;
		path.title = file.path;

		if (this._editable) {
			const editing = append(header, $('span.swarm-code-view-editingBadge'));
			const editingIcon = append(editing, $('span.swarm-code-view-fileIcon'));
			editingIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.edit));
			const editingLabel = append(editing, $('span'));
			editingLabel.textContent = localize('swarm.codeView.editing', "editing");
		}

		const additions = append(header, $('span.swarm-code-view-additions'));
		additions.textContent = `+${file.additions}`;
		const deletions = append(header, $('span.swarm-code-view-deletions'));
		deletions.textContent = `\u2212${file.deletions}`;

		const table = append(card, $('table.swarm-code-view-table'));
		const tbody = append(table, $('tbody'));

		file.lines.forEach((line, index) => {
			this._renderLine(tbody, file, line, index);
		});
	}

	private _renderLine(tbody: HTMLElement, file: ISwarmFileDiff, line: ISwarmDiffLine, index: number): void {
		if (line.type === SwarmDiffLineType.Hunk) {
			const row = append(tbody, $('tr.swarm-code-view-hunkRow'));
			append(row, $('td.swarm-code-view-gutter'));
			const cell = append(row, $('td.swarm-code-view-hunkCell'));
			cell.textContent = line.text;
			return;
		}

		const key = lineKey(file.path, index);
		const isDeleted = line.type === SwarmDiffLineType.Delete;
		const canEdit = this._editable && !isDeleted;
		const isDrafting = this._draftKey === key;

		const row = append(tbody, $('tr.swarm-code-view-lineRow'));
		if (line.type === SwarmDiffLineType.Add) {
			row.classList.add('swarm-code-view-line-add');
		} else if (isDeleted) {
			row.classList.add('swarm-code-view-line-delete');
		}
		if (canEdit) {
			row.classList.add('swarm-code-view-line-editable');
		}

		const gutter = append(row, $('td.swarm-code-view-gutter'));
		gutter.textContent = line.type === SwarmDiffLineType.Add ? '+' : isDeleted ? '\u2212' : ' ';

		const cell = append(row, $('td.swarm-code-view-lineCell'));
		const lineContent = append(cell, $('.swarm-code-view-lineContent'));

		if (canEdit) {
			const input = append(lineContent, $('input.swarm-code-view-lineInput')) as HTMLInputElement;
			input.type = 'text';
			input.spellcheck = false;
			input.value = this._edits.get(key) ?? line.text;
			input.setAttribute('aria-label', localize('swarm.codeView.editLine', "Edit line {0} of {1}", index + 1, file.path));
			if (this._edits.has(key) && this._edits.get(key) !== line.text) {
				input.classList.add('swarm-code-view-lineInput-modified');
			}
			this._renderStore.add(addDisposableListener(input, 'input', () => {
				this._edits.set(key, input.value);
				input.classList.toggle('swarm-code-view-lineInput-modified', input.value !== line.text);
				this._updateEditCount();
				this._onDidChangeEditCount.fire(this.editCount);
			}));
		} else {
			const text = append(lineContent, $('span.swarm-code-view-lineText'));
			text.textContent = line.text.length > 0 ? line.text : ' ';
		}

		if (!this._editable && !isDrafting) {
			const addButton = append(lineContent, $('button.swarm-code-view-addComment')) as HTMLButtonElement;
			addButton.type = 'button';
			addButton.setAttribute('aria-label', localize('swarm.codeView.addComment', "Add comment on this line"));
			const addIcon = append(addButton, $('span.swarm-code-view-fileIcon'));
			addIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.comment));
			this._renderStore.add(addDisposableListener(addButton, 'click', () => {
				this._draftKey = key;
				this._render();
			}));
		}

		const comments = this._comments.get(key) ?? [];
		if (comments.length > 0 || isDrafting) {
			this._renderCommentRow(tbody, key, comments);
		}
	}

	private _renderCommentRow(tbody: HTMLElement, key: string, comments: readonly ISwarmInlineComment[]): void {
		const row = append(tbody, $('tr.swarm-code-view-commentRow'));
		append(row, $('td.swarm-code-view-gutter'));
		const cell = append(row, $('td.swarm-code-view-commentCell'));
		const list = append(cell, $('.swarm-code-view-commentList'));

		for (const comment of comments) {
			const item = append(list, $('.swarm-code-view-comment'));
			const icon = append(item, $('span.swarm-code-view-fileIcon'));
			icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.reply));
			const text = append(item, $('p.swarm-code-view-commentText'));
			text.textContent = comment.text;
			const remove = append(item, $('button.swarm-code-view-commentRemove')) as HTMLButtonElement;
			remove.type = 'button';
			remove.setAttribute('aria-label', localize('swarm.codeView.removeComment', "Delete comment"));
			const removeIcon = append(remove, $('span.swarm-code-view-fileIcon'));
			removeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.close));
			this._renderStore.add(addDisposableListener(remove, 'click', () => {
				const next = (this._comments.get(key) ?? []).filter(c => c.id !== comment.id);
				if (next.length > 0) {
					this._comments.set(key, next);
				} else {
					this._comments.delete(key);
				}
				this._onDidChangeCommentCount.fire(this.commentCount);
				this._render();
			}));
		}

		if (this._draftKey === key) {
			this._renderCommentEditor(list, key);
		}
	}

	private _renderCommentEditor(list: HTMLElement, key: string): void {
		const editor = append(list, $('.swarm-code-view-commentEditor'));
		const textarea = append(editor, $('textarea.swarm-code-view-commentInput')) as HTMLTextAreaElement;
		textarea.rows = 2;
		textarea.placeholder = localize('swarm.codeView.commentPlaceholder', "Leave a comment\u2026");
		textarea.setAttribute('aria-label', localize('swarm.codeView.commentInput', "Comment"));

		const actions = append(editor, $('.swarm-code-view-commentActions'));
		const cancel = append(actions, $('button.swarm-code-view-commentCancel')) as HTMLButtonElement;
		cancel.type = 'button';
		cancel.textContent = localize('swarm.codeView.cancel', "Cancel");
		const save = append(actions, $('button.swarm-code-view-commentSave')) as HTMLButtonElement;
		save.type = 'button';
		save.textContent = localize('swarm.codeView.addCommentAction', "Add comment");
		save.disabled = true;

		const commit = () => {
			const value = textarea.value.trim();
			if (!value) {
				return;
			}
			const existing = this._comments.get(key) ?? [];
			this._comments.set(key, [...existing, { id: generateUuid(), text: value }]);
			this._draftKey = undefined;
			this._onDidChangeCommentCount.fire(this.commentCount);
			this._render();
		};

		this._renderStore.add(addDisposableListener(textarea, 'input', () => {
			save.disabled = textarea.value.trim().length === 0;
		}));
		this._renderStore.add(addDisposableListener(textarea, 'keydown', e => {
			if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				commit();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				this._draftKey = undefined;
				this._render();
			}
		}));
		this._renderStore.add(addDisposableListener(cancel, 'click', () => {
			this._draftKey = undefined;
			this._render();
		}));
		this._renderStore.add(addDisposableListener(save, 'click', commit));

		textarea.focus();
	}

	private _renderReviewFooter(): void {
		const footer = append(this._body, $('.swarm-code-view-review'));

		if (this._editable) {
			this._renderEditBanner(footer);
			return;
		}

		if (this._submitted) {
			const banner = append(footer, $('.swarm-code-view-reviewBanner'));
			const icon = append(banner, $('span.swarm-code-view-fileIcon'));
			icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
			const label = append(banner, $('p.swarm-code-view-reviewBannerText'));
			label.textContent = localize(
				'swarm.codeView.reviewSubmitted',
				"Review submitted \u00b7 {0} \u00b7 {1}",
				this._submitted.verdict,
				this._submitted.commentCount === 1
					? localize('swarm.codeView.commentOne', "1 comment")
					: localize('swarm.codeView.commentMany', "{0} comments", this._submitted.commentCount),
			);
			const edit = append(banner, $('button.swarm-code-view-reviewEdit')) as HTMLButtonElement;
			edit.type = 'button';
			edit.textContent = localize('swarm.codeView.editReview', "Edit review");
			this._renderStore.add(addDisposableListener(edit, 'click', () => {
				this._submitted = undefined;
				this._render();
			}));
			return;
		}

		const heading = append(footer, $('.swarm-code-view-reviewHeading'));
		const headingLabel = append(heading, $('span.swarm-code-view-reviewTitle'));
		headingLabel.textContent = localize('swarm.codeView.finishReview', "Finish your review");
		const count = append(heading, $('span.swarm-code-view-reviewCount'));
		count.textContent = this.commentCount === 1
			? localize('swarm.codeView.inlineCommentOne', "1 inline comment")
			: localize('swarm.codeView.inlineCommentMany', "{0} inline comments", this.commentCount);

		const editToggle = append(heading, $('button.swarm-code-view-editToggle')) as HTMLButtonElement;
		editToggle.type = 'button';
		editToggle.setAttribute('aria-pressed', 'false');
		editToggle.title = localize('swarm.codeView.editToggleTitle', "Edit changed files inline");
		const editToggleIcon = append(editToggle, $('span.swarm-code-view-fileIcon'));
		editToggleIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.edit));
		const editToggleLabel = append(editToggle, $('span'));
		editToggleLabel.textContent = localize('swarm.codeView.editToggle', "Edit");
		this._renderStore.add(addDisposableListener(editToggle, 'click', () => this.setEditable(true)));

		const summary = append(footer, $('textarea.swarm-code-view-reviewSummary')) as HTMLTextAreaElement;
		summary.rows = 2;
		summary.value = this._summary;
		summary.placeholder = localize('swarm.codeView.summaryPlaceholder', "Summary comment (optional)\u2026");
		summary.setAttribute('aria-label', localize('swarm.codeView.summaryLabel', "Review summary"));
		this._renderStore.add(addDisposableListener(summary, 'input', () => {
			this._summary = summary.value;
		}));

		const actions = append(footer, $('.swarm-code-view-reviewActions'));
		const segmented = append(actions, $('.swarm-code-view-verdicts'));
		segmented.setAttribute('role', 'group');
		segmented.setAttribute('aria-label', localize('swarm.codeView.verdictLabel', "Review verdict"));
		for (const verdict of VERDICTS) {
			const button = append(segmented, $('button.swarm-code-view-verdict')) as HTMLButtonElement;
			button.type = 'button';
			button.textContent = verdict.label;
			button.setAttribute('aria-pressed', String(this._verdict === verdict.id));
			if (this._verdict === verdict.id) {
				button.classList.add('swarm-code-view-verdict-active', verdict.className);
			}
			this._renderStore.add(addDisposableListener(button, 'click', () => {
				this._verdict = verdict.id;
				this._render();
			}));
		}

		const submit = append(actions, $('button.swarm-code-view-submit')) as HTMLButtonElement;
		submit.type = 'button';
		const submitIcon = append(submit, $('span.swarm-code-view-fileIcon'));
		submitIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
		const submitLabel = append(submit, $('span'));
		submitLabel.textContent = localize('swarm.codeView.submitReview', "Submit review");
		this._renderStore.add(addDisposableListener(submit, 'click', () => {
			const submission: ISwarmReviewSubmission = {
				verdict: this._verdict,
				summary: this._summary.trim(),
				commentCount: this.commentCount,
			};
			this._submitted = submission;
			this._onDidSubmitReview.fire(submission);
			this._render();
		}));
	}

	private _renderEditBanner(footer: HTMLElement): void {
		const banner = append(footer, $('.swarm-code-view-editBanner'));
		const icon = append(banner, $('span.swarm-code-view-fileIcon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.edit));
		const label = append(banner, $('p.swarm-code-view-editBannerText'));
		label.textContent = localize(
			'swarm.codeView.editBanner',
			"Inline edit mode \u2014 edits apply to changed files only and stay local to this review.",
		);

		const count = append(banner, $('span.swarm-code-view-editCount'));
		this._editCountElement = count;
		this._updateEditCount();

		const done = append(banner, $('button.swarm-code-view-editDone')) as HTMLButtonElement;
		done.type = 'button';
		done.textContent = localize('swarm.codeView.editDone', "Done");
		this._renderStore.add(addDisposableListener(done, 'click', () => this.setEditable(false)));
	}

	private _updateEditCount(): void {
		if (!this._editCountElement) {
			return;
		}
		const count = this.editCount;
		this._editCountElement.textContent = count === 1
			? localize('swarm.codeView.editOne', "1 edit")
			: localize('swarm.codeView.editMany', "{0} edits", count);
	}

	override dispose(): void {
		this._renderStore.dispose();
		super.dispose();
	}
}
