#!/usr/bin/env node
/**
 * SubagentStart Hook - Track subagent spawning
 *
 * Triggered when a subagent (Task tool) is started.
 * Tracks agent metadata for synthesis and cost allocation.
 */

const { parseHookInput, loadState, saveState, logMessage } = require('./utils.cjs');

// Parse input from hook
const parsed = parseHookInput();
const agentId = parsed.agent_id || parsed.task_id || `agent-${Date.now()}`;
const agentType = parsed.tool_input?.subagent_type || 'general-purpose';
const description = parsed.tool_input?.description || '';
const model = parsed.tool_input?.model || 'sonnet';
const runInBackground = parsed.tool_input?.run_in_background || false;

// Load active agents
const activeAgents = loadState('active_agents.json', {});

// Track this agent
activeAgents[agentId] = {
    id: agentId,
    type: agentType,
    description,
    model,
    runInBackground,
    startTime: new Date().toISOString(),
    status: 'running'
};

saveState('active_agents.json', activeAgents);

// Log the agent start
logMessage(`SubagentStart id=${agentId} type=${agentType} model=${model}`);

// Output
const output = {
    tracked: true,
    agentId,
    agentType,
    model,
    activeCount: Object.keys(activeAgents).length
};

console.log(JSON.stringify(output));
