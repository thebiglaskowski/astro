#!/usr/bin/env node
/**
 * SubagentStop Hook - Synthesize subagent results
 *
 * Triggered when a subagent completes.
 * Synthesizes results and updates cost tracking.
 */

const { parseHookInput, loadState, saveState, logMessage, MAX_RESULT_LENGTH, MAX_AGENT_HISTORY } = require('./utils.cjs');

// Parse input from hook
const parsed = parseHookInput();
const agentId = parsed.agent_id || parsed.task_id || '';
const success = parsed.success !== false;
const resultSummary = parsed.result_summary || parsed.output?.substring(0, MAX_RESULT_LENGTH) || '';

// Load active agents
const activeAgents = loadState('active_agents.json', {});

// Get agent info
const agentInfo = activeAgents[agentId] || {
    id: agentId,
    type: 'unknown',
    startTime: new Date().toISOString()
};

// Calculate duration
const startTime = new Date(agentInfo.startTime);
const endTime = new Date();
const durationMs = endTime - startTime;
const durationSec = Math.round(durationMs / 1000);

// Create history entry
const historyEntry = {
    ...agentInfo,
    endTime: endTime.toISOString(),
    durationSeconds: durationSec,
    success,
    resultSummary: resultSummary.substring(0, MAX_RESULT_LENGTH)
};

// Load and update history
let history = loadState('agent_history.json', []);
history.push(historyEntry);

// Keep only last N entries
if (history.length > MAX_AGENT_HISTORY) {
    history = history.slice(-MAX_AGENT_HISTORY);
}
saveState('agent_history.json', history);

// Remove from active agents
if (activeAgents[agentId]) {
    delete activeAgents[agentId];
    saveState('active_agents.json', activeAgents);
}

// Log the agent completion
const status = success ? 'completed' : 'failed';
logMessage(`SubagentStop id=${agentId} status=${status} duration=${durationSec}s`);

// Output synthesis
const output = {
    agentId,
    type: agentInfo.type,
    success,
    durationSeconds: durationSec,
    remainingAgents: Object.keys(activeAgents).length
};

console.log(JSON.stringify(output));
