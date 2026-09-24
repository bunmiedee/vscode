/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { AgentGridModePart } from '../../../swarm/browser/agentGridModePart.js';
import { ChatConfiguration } from '../../common/constants.js';

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

	private _update(enabled: boolean): void {
		this._enabled = enabled;
		this.logService.info('[AgentGridMode] updating visibility', { enabled });
		this._part?.setVisible(enabled);
	}
}
