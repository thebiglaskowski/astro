#!/usr/bin/env node
/**
 * Profile schema validation test
 *
 * Validates all profiles/*.yaml files against _profile.schema.yaml requirements.
 * Uses simple line-based YAML parsing — no dependencies.
 *
 * Run: node profiles/__tests__/test-profiles.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const profilesDir = path.resolve(__dirname, '..');

// Test infrastructure
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        process.stdout.write(`  \x1b[32m✓\x1b[0m ${name}\n`);
    } catch (e) {
        failed++;
        failures.push({ name, error: e.message });
        process.stdout.write(`  \x1b[31m✗\x1b[0m ${name}\n    ${e.message}\n`);
    }
}

function suite(name, fn) {
    process.stdout.write(`\n\x1b[1m${name}\x1b[0m\n`);
    fn();
}

/**
 * Minimal YAML top-level key extractor.
 * Returns an object with top-level keys and their raw values.
 * Only parses top-level scalar keys (not nested structures).
 */
function parseTopLevelKeys(content) {
    const result = {};
    const lines = content.split('\n');
    for (const line of lines) {
        // Skip comments and empty lines
        if (line.startsWith('#') || line.trim() === '') continue;
        // Match top-level keys (no leading whitespace)
        const match = line.match(/^([a-z_][a-z0-9_]*)\s*:\s*(.*)/);
        if (match) {
            let value = match[2].trim();
            // Remove quotes
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            result[match[1]] = value;
        }
    }
    return result;
}

/**
 * Extract a section block from YAML by top-level key.
 * Returns the raw text of the section.
 */
function extractSection(content, sectionName) {
    const lines = content.split('\n');
    let capturing = false;
    let section = [];
    for (const line of lines) {
        if (line.startsWith('#') && !capturing) continue;
        const topKeyMatch = line.match(/^([a-z_][a-z0-9_]*)\s*:/);
        if (topKeyMatch) {
            if (capturing) break; // End of section
            if (topKeyMatch[1] === sectionName) {
                capturing = true;
                section.push(line);
                continue;
            }
        }
        if (capturing) {
            section.push(line);
        }
    }
    return section.join('\n');
}

/**
 * Check if a section has a specific nested key.
 */
function sectionHasKey(content, sectionName, key) {
    const section = extractSection(content, sectionName);
    const regex = new RegExp(`^\\s+${key}\\s*:`, 'm');
    return regex.test(section);
}

/**
 * Get all gate names from the gates section.
 */
function getGateNames(content) {
    const section = extractSection(content, 'gates');
    const names = [];
    const lines = section.split('\n');
    for (const line of lines) {
        // Gates are indented exactly 2 spaces
        const match = line.match(/^  ([a-z_]+)\s*:/);
        if (match && match[1] !== 'gates') {
            names.push(match[1]);
        }
    }
    return names;
}

/**
 * Check if a gate has a 'command', 'detect', or domain-specific command keys.
 * The notebook gate is special — it uses lint_command, test_command, etc.
 */
function gateHasCommand(content, gateName) {
    const gatesSection = extractSection(content, 'gates');
    const lines = gatesSection.split('\n');
    let inGate = false;
    for (const line of lines) {
        const gateMatch = line.match(/^  ([a-z_]+)\s*:/);
        if (gateMatch) {
            inGate = gateMatch[1] === gateName;
            continue;
        }
        if (inGate) {
            // Accept: command, detect, or any *_command key within the gate
            if (line.match(/^\s{4}(command|detect|[a-z]+_command)\s*:/)) return true;
            // If we hit another top-level gate entry, stop
            if (line.match(/^  [a-z_]+\s*:/)) break;
        }
    }
    return false;
}

// Discover all profile files (exclude schema)
const profileFiles = fs.readdirSync(profilesDir)
    .filter(f => f.endsWith('.yaml') && !f.startsWith('_'))
    .sort();

// ─────────────────────────────────────────────────────────────
// Schema-level validations
// ─────────────────────────────────────────────────────────────
suite('Profile discovery', () => {
    test('found at least 5 profiles', () => {
        assert.ok(profileFiles.length >= 5,
            `Expected at least 5 profiles, found ${profileFiles.length}: ${profileFiles.join(', ')}`);
    });

    test('expected profiles exist', () => {
        const expected = ['python.yaml', 'typescript.yaml', 'go.yaml', 'rust.yaml', 'general.yaml'];
        for (const name of expected) {
            assert.ok(profileFiles.includes(name), `Missing profile: ${name}`);
        }
    });

    test('schema file exists', () => {
        assert.ok(fs.existsSync(path.join(profilesDir, '_profile.schema.yaml')),
            '_profile.schema.yaml not found');
    });
});

// ─────────────────────────────────────────────────────────────
// Per-profile validations
// ─────────────────────────────────────────────────────────────
for (const file of profileFiles) {
    const profilePath = path.join(profilesDir, file);
    const content = fs.readFileSync(profilePath, 'utf8');
    const keys = parseTopLevelKeys(content);
    const profileName = file.replace('.yaml', '');

    suite(`${file} — required fields`, () => {
        test('has name field', () => {
            assert.ok(keys.name, 'missing name field');
        });

        test('name matches filename', () => {
            assert.strictEqual(keys.name, profileName,
                `name "${keys.name}" doesn't match filename "${profileName}"`);
        });

        test('has version field', () => {
            assert.ok(keys.version, 'missing version field');
        });

        test('version follows semver-like format', () => {
            assert.ok(/^\d+\.\d+/.test(keys.version),
                `version "${keys.version}" doesn't match expected format (e.g., "1.0")`);
        });

        test('has description field', () => {
            assert.ok(keys.description, 'missing description field');
            assert.ok(keys.description.length > 10,
                `description too short: "${keys.description}"`);
        });

        test('has detection section', () => {
            assert.ok(content.includes('\ndetection:') || content.includes('detection:'),
                'missing detection section');
        });
    });

    suite(`${file} — gates section`, () => {
        const gateNames = getGateNames(content);

        test('has gates section', () => {
            assert.ok(content.includes('\ngates:'),
                'missing gates section');
        });

        test('has at least one gate', () => {
            assert.ok(gateNames.length >= 1,
                `no gates found, expected at least 1`);
        });

        test('has lint gate', () => {
            assert.ok(gateNames.includes('lint'),
                `missing lint gate (found: ${gateNames.join(', ')})`);
        });

        test('has test gate', () => {
            assert.ok(gateNames.includes('test'),
                `missing test gate (found: ${gateNames.join(', ')})`);
        });

        test('all gates have command or detect', () => {
            for (const gate of gateNames) {
                assert.ok(gateHasCommand(content, gate),
                    `gate "${gate}" missing command or detect key`);
            }
        });

        test('all gates have description', () => {
            const gatesSection = extractSection(content, 'gates');
            for (const gate of gateNames) {
                // Find the gate block and check for description
                const regex = new RegExp(`^\\s{4}description:`, 'm');
                // Extract per-gate block
                const lines = gatesSection.split('\n');
                let inGate = false;
                let hasDesc = false;
                for (const line of lines) {
                    const gateMatch = line.match(/^  ([a-z_]+)\s*:/);
                    if (gateMatch) {
                        if (inGate && !hasDesc) {
                            assert.fail(`gate "${gate}" missing description`);
                        }
                        inGate = gateMatch[1] === gate;
                        hasDesc = false;
                        continue;
                    }
                    if (inGate && line.match(/^\s+description:/)) {
                        hasDesc = true;
                    }
                }
                if (inGate && !hasDesc) {
                    assert.fail(`gate "${gate}" missing description`);
                }
            }
        });
    });

    suite(`${file} — models section`, () => {
        test('has models section', () => {
            assert.ok(content.includes('\nmodels:'),
                'missing models section');
        });

        test('has default model', () => {
            assert.ok(sectionHasKey(content, 'models', 'default'),
                'missing models.default');
        });

        test('has by_phase routing', () => {
            assert.ok(sectionHasKey(content, 'models', 'by_phase'),
                'missing models.by_phase');
        });

        test('by_phase includes all 7 phases', () => {
            const modelsSection = extractSection(content, 'models');
            const phases = ['init', 'understand', 'plan', 'execute', 'verify', 'commit', 'evaluate'];
            for (const phase of phases) {
                assert.ok(modelsSection.includes(`${phase}:`),
                    `models.by_phase missing phase: ${phase}`);
            }
        });
    });

    suite(`${file} — thinking section`, () => {
        test('has thinking section', () => {
            assert.ok(content.includes('\nthinking:'),
                'missing thinking section');
        });

        test('has max_tokens', () => {
            assert.ok(sectionHasKey(content, 'thinking', 'max_tokens'),
                'missing thinking.max_tokens');
        });

        test('has extended_for list', () => {
            assert.ok(sectionHasKey(content, 'thinking', 'extended_for'),
                'missing thinking.extended_for');
        });
    });

    suite(`${file} — optional sections`, () => {
        test('has conventions', () => {
            assert.ok(content.includes('\nconventions:'),
                'missing conventions section');
        });

        if (profileName !== 'general') {
            test('has detection files or patterns', () => {
                const detectionSection = extractSection(content, 'detection');
                assert.ok(
                    detectionSection.includes('files:') || detectionSection.includes('patterns:'),
                    'detection section missing files or patterns'
                );
            });
        }
    });

    suite(`${file} — no non-standard gate keys`, () => {
        test('no *_command keys in gates (use command/alternative)', () => {
            const gatesSection = extractSection(content, 'gates');
            // These patterns are OK: command, alternative, fix_command, verbose_command,
            // coverage_command, check_command, detect (general profile)
            // NOT OK: maven_command, gradle_command, cmake_command, make_command, powershell_command
            const badPatterns = [
                /maven_command:/,
                /gradle_command:/,
                /cmake_command:/,
                /make_command:/,
                /powershell_command:/,
            ];
            for (const pattern of badPatterns) {
                assert.ok(!pattern.test(gatesSection),
                    `found non-standard gate key matching ${pattern}`);
            }
        });
    });
}

// ─────────────────────────────────────────────────────────────
// Cross-profile consistency
// ─────────────────────────────────────────────────────────────
suite('Cross-profile consistency', () => {
    test('all profiles use same model for default', () => {
        const models = profileFiles.map(f => {
            const content = fs.readFileSync(path.join(profilesDir, f), 'utf8');
            const section = extractSection(content, 'models');
            const match = section.match(/^\s+default:\s*(\w+)/m);
            return match ? match[1] : null;
        });
        const unique = [...new Set(models.filter(Boolean))];
        assert.strictEqual(unique.length, 1,
            `inconsistent default models: ${unique.join(', ')}`);
    });

    test('all profiles have same max_tokens for thinking', () => {
        const tokens = profileFiles.map(f => {
            const content = fs.readFileSync(path.join(profilesDir, f), 'utf8');
            const section = extractSection(content, 'thinking');
            const match = section.match(/max_tokens:\s*(\d+)/);
            return match ? match[1] : null;
        });
        const unique = [...new Set(tokens.filter(Boolean))];
        assert.strictEqual(unique.length, 1,
            `inconsistent max_tokens: ${unique.join(', ')}`);
    });

    test('general profile has fallback: true', () => {
        const content = fs.readFileSync(path.join(profilesDir, 'general.yaml'), 'utf8');
        const detection = extractSection(content, 'detection');
        assert.ok(detection.includes('fallback: true'),
            'general profile should have detection.fallback: true');
    });
});

// ─────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────
process.stdout.write('\n─────────────────────────────────────\n');
process.stdout.write(`\x1b[1mResults:\x1b[0m ${passed} passed, ${failed} failed\n`);
process.stdout.write(`\x1b[1mProfiles tested:\x1b[0m ${profileFiles.length}\n`);

if (failures.length > 0) {
    process.stdout.write('\n\x1b[31mFailures:\x1b[0m\n');
    for (const f of failures) {
        process.stdout.write(`  - ${f.name}: ${f.error}\n`);
    }
}

process.exit(failed > 0 ? 1 : 0);
