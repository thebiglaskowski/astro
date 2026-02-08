#!/usr/bin/env node
/**
 * SessionEnd Hook - Archive session and update STATUS.md
 *
 * Triggered when a Claude Code session ends.
 * Archives session state and optionally updates STATUS.md.
 */

const fs = require('fs');
const path = require('path');
const { loadJsonFile, saveJsonFile, logMessage, getStateFilePath } = require('./utils.cjs');

const stateDir = path.join(process.cwd(), '.claude', 'state');
const archiveDir = path.join(stateDir, 'archive');

// Ensure archive directory exists
if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
}

// Read session start info
const sessionInfo = loadJsonFile(
    getStateFilePath('session_start.json'),
    { id: 'unknown', timestamp: new Date().toISOString() }
);

// Calculate session duration
const startTime = sessionInfo.timestamp ? new Date(sessionInfo.timestamp) : new Date();
const endTime = new Date();
const durationMs = endTime - startTime;
const durationMin = Math.round(durationMs / 60000);

// Read file changes if tracked
const fileChanges = loadJsonFile(getStateFilePath('file_changes.json'), []);

// Create session archive
const sessionEnd = {
    ...sessionInfo,
    endTimestamp: endTime.toISOString(),
    durationMinutes: durationMin,
    filesChanged: fileChanges.length,
    filesList: fileChanges
};

// Archive the session
const archiveFile = path.join(archiveDir, `${sessionInfo.id || 'session'}.json`);
saveJsonFile(archiveFile, sessionEnd);

// Clean up current session files
const sessionFile = getStateFilePath('session_start.json');
const changesFile = getStateFilePath('file_changes.json');
if (fs.existsSync(sessionFile)) {
    fs.unlinkSync(sessionFile);
}
if (fs.existsSync(changesFile)) {
    fs.unlinkSync(changesFile);
}

// Log the session end
logMessage(`SessionEnd id=${sessionInfo.id || 'unknown'} duration=${durationMin}min files=${fileChanges.length}`);

// Output summary
const output = {
    sessionId: sessionInfo.id,
    duration: `${durationMin} minutes`,
    filesChanged: fileChanges.length,
    archived: archiveFile
};

console.log(JSON.stringify(output));
