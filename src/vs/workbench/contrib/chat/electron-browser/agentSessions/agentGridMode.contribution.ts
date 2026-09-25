/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { SwarmModeActiveContext } from '../../../../common/contextkeys.js';
import { AgentGridModePart } from '../../../swarm/browser/agentGridModePart.js';
import { ChatConfiguration } from '../../common/constants.js';

const ADD_SWARM_CHAT_COMMAND_ID = 'workbench.action.chat.swarm.addChat';

/**
 * The single live {@link AgentGridModeContribution}, if one has been created.
 * The title bar action needs to reach the swarm part, but workbench
 * contributions are not registered as services, so the contribution publishes
 * itself here for the action to consume.
 */
let agentGridModeContribution: AgentGridModeContribution | undefined;

/**
 * Adds a new agent chat to the swarm grid. Only visible while the swarm surface
 * is showing, where it replaces the workbench layout controls in the title bar.
 *
 * It lives in the right-aligned global title bar actions (rather than the
 * center-adjacent toolbar) so it sits at the far right of the title bar, next
 * to the other global actions.
 */
class AddSwarmChatAction extends Action2 {

	constructor() {
		super({
			id: ADD_SWARM_CHAT_COMMAND_ID,
			title: localize2('swarm.addChat', "New Agent Chat"),
			f1: false,
			icon: Codicon.add,
			menu: {
				id: MenuId.TitleBar,
				group: 'navigation',
				order: 10010,
				when: SwarmModeActiveContext,
			},
		});
	}

	run(): void {
		agentGridModeContribution?.addChat();
	}
}

registerAction2(AddSwarmChatAction);

/**
 * Owns the Agent Grid Mode surface. It observes the
 * `chat.titleBar.agentGridMode.enabled` setting and shows or hides the
 * full-window swarm surface accordingly, restoring the default workbench when
 * the setting is disabled.
 */
export class AgentGridModeContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentGridMode';

	private _part: AgentGridModePart | undefined;
	private _enabled = false;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._enabled = this.configurationService.getValue<boolean>(ChatConfiguration.TitleBarAgentGridModeEnabled) === true;
		this.logService.info('[AgentGridMode] contribution constructed', { enabled: this._enabled });

		agentGridModeContribution = this;
		this._register(toDisposable(() => {
			if (agentGridModeContribution === this) {
				agentGridModeContribution = undefined;
			}
		}));

		this._part = this._register(instantiationService.createInstance(AgentGridModePart));
		this._part.setVisible(this._enabled);

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.TitleBarAgentGridModeEnabled)) {
				const updatedEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.TitleBarAgentGridModeEnabled) === true;
				this.logService.info('[AgentGridMode] configuration changed', { enabled: updatedEnabled });
				this._update(updatedEnabled);
			}
		}));
	}

	/**
	 * Adds a new agent chat to the swarm grid. Invoked by the title bar
	 * {@link AddSwarmChatAction} while the swarm surface is showing.
	 */
	addChat(): void {
		this._part?.swarmApp.addChat();
	}

	private _update(enabled: boolean): void {
		this._enabled = enabled;
		this.logService.info('[AgentGridMode] updating visibility', { enabled });
		this._part?.setVisible(enabled);
	}
}
