import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { saveCheckpoint } from '../checkpoint';
import { DEFAULT_CONFIG } from '../config';
import { computeSnapshot } from '../thresholds';
import { buildResumeOrientation, buildSessionStartContext } from '../tick';

const CHECKPOINT_DIR = '.claude-checkpoints';

let CWD: string;

beforeEach(() => {
    CWD = path.join(os.tmpdir(), `cc-pacekeeper-banner-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(CWD, { recursive: true });
});

afterEach(() => {
    try { fs.rmSync(CWD, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('buildSessionStartContext', () => {
    test('returns empty string when there are no active checkpoints', () => {
        expect(buildSessionStartContext(CWD, CHECKPOINT_DIR)).toBe('');
    });

    test('renders single-lane wording for exactly one active lane', () => {
        saveCheckpoint({
            cwd: CWD, checkpointDirName: CHECKPOINT_DIR,
            frontmatter: { name: 'lane-a' }, body: '## Goal\nDo the thing\n'
        });
        const out = buildSessionStartContext(CWD, CHECKPOINT_DIR);
        expect(out).toContain('Active checkpoint found');
        expect(out).toContain('Do the thing');
        expect(out).toContain('/cc-pacekeeper:checkpoint resume');
        // Single-lane wording should not mention lane-picking.
        expect(out).not.toContain('lanes found');
    });

    test('renders one line per lane for multiple active lanes', () => {
        saveCheckpoint({
            cwd: CWD, checkpointDirName: CHECKPOINT_DIR,
            frontmatter: { name: 'lane-a', git_branch: 'feature-a' }, body: '## Goal\nGoal A\n'
        });
        saveCheckpoint({
            cwd: CWD, checkpointDirName: CHECKPOINT_DIR,
            frontmatter: { name: 'lane-b', git_branch: 'feature-b' }, body: '## Goal\nGoal B\n'
        });
        saveCheckpoint({
            cwd: CWD, checkpointDirName: CHECKPOINT_DIR,
            frontmatter: { name: 'lane-c', git_branch: 'feature-c' }, body: '## Goal\nGoal C\n'
        });

        const out = buildSessionStartContext(CWD, CHECKPOINT_DIR);
        expect(out).toContain('3 active checkpoint lanes');
        expect(out).toContain('lane-a · feature-a');
        expect(out).toContain('Goal A');
        expect(out).toContain('lane-b · feature-b');
        expect(out).toContain('Goal B');
        expect(out).toContain('lane-c · feature-c');
        expect(out).toContain('Goal C');
        expect(out).toContain('resume <name>');
    });
});

describe('buildResumeOrientation', () => {
    const snap = computeSnapshot({ contextPercent: null, usage: null }, DEFAULT_CONFIG);

    test('with nothing pending, says so and asks for a one-word reply', () => {
        const out = buildResumeOrientation(CWD, DEFAULT_CONFIG, snap);
        expect(out).toContain('[pacekeeper-resume]');
        expect(out).toContain('nothing is pending');
        expect(out).toContain('single word');
        expect(out).not.toContain('Run `pacekeeper-checkpoint resume');
    });

    test('with an active lane, still instructs resume', () => {
        saveCheckpoint({
            cwd: CWD, checkpointDirName: DEFAULT_CONFIG.checkpoint_dir_name,
            frontmatter: { name: 'lane' }, body: '## Goal\nGo\n'
        });
        const out = buildResumeOrientation(CWD, DEFAULT_CONFIG, snap);
        expect(out).toContain('Run `pacekeeper-checkpoint resume');
        expect(out).toContain('Active lane(s): lane');
    });
});
