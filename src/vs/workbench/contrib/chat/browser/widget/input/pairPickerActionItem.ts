/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ChatInputPickerActionViewItem, IChatInputPickerOptions } from './chatInputPickerActionItem.js';

/**
 * Placeholder "Pair" picker for the swarm composer.
 *
 * The proto introduces a Pair control in the textfield toolbar. There is no
 * backing feature yet, so this picker renders a small static option list and
 * records the selection locally. It is intentionally self-contained so it can
 * be wired to real pairing behavior later without touching the composer.
 */
export class PairPickerActionItem extends ChatInputPickerActionViewItem {

	private _selectedId = 'pair.none';

	constructor(
		action: MenuItemAction,
		pickerOptions: IChatInputPickerOptions,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const items: { id: string; label: string; detail: string; icon: typeof Codicon.sync }[] = [
					{ id: 'pair.none', label: localize('pair.none', "Not paired"), detail: localize('pair.none.detail', "Work on this session alone"), icon: Codicon.account },
					{ id: 'pair.driver', label: localize('pair.driver', "Pair as driver"), detail: localize('pair.driver.detail', "You drive, the agent navigates"), icon: Codicon.person },
					{ id: 'pair.navigator', label: localize('pair.navigator', "Pair as navigator"), detail: localize('pair.navigator.detail', "The agent drives, you navigate"), icon: Codicon.rocket },
				];
				return items.map(item => ({
					...action,
					id: item.id,
					label: item.label,
					detail: item.detail,
					icon: item.icon,
					checked: this._selectedId === item.id,
					run: async () => {
						this._selectedId = item.id;
						if (this.element) {
							this.renderLabel(this.element);
						}
					},
				} satisfies IActionWidgetDropdownAction));
			}
		};

		super(action, {
			actionProvider,
			reporter: { id: 'ChatPairPicker', name: 'ChatPairPicker', includeOptions: true },
			listOptions: { minWidth: 220, ...pickerOptions.listOptions },
		}, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-pair-picker-item');
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		this.setAriaLabelAttributes(element);
		element.textContent = '';
		const compact = this.pickerOptions.compact.get();
		element.classList.toggle('icon-only', compact);
		if (compact) {
			element.append(...renderLabelWithIcons(`$(${Codicon.sync.id})`));
		} else {
			element.append(...renderLabelWithIcons(`$(${Codicon.sync.id}) ${localize('pair.label', "Pair")}`));
		}
		return null;
	}
}
