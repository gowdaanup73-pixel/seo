// tests/terrain.test.js — Automated tests for MountainViewer logic
import test from 'node:test';
import assert from 'node:assert/strict';
import TerraMountain from '../terrain.js';

test('Terrain Module: Exports MountainViewer class', () => {
  assert.ok(TerraMountain);
  assert.ok(TerraMountain.MountainViewer);
  assert.strictEqual(typeof TerraMountain.MountainViewer, 'function');
});

test('Terrain Module: Fallback gracefully renders when WebGL is absent', () => {
  const fakeContainer = {
    innerHTML: '',
    appendChild() {},
    clientWidth: 800,
    clientHeight: 500
  };

  const viewer = new TerraMountain.MountainViewer(fakeContainer, { interactive: false });
  assert.ok(fakeContainer.innerHTML.includes('Topographic Elevation Profile (2D Fallback)'));
});

test('Terrain Module: Default preview issues provide full coverage of regions', () => {
  const fakeContainer = { innerHTML: '', appendChild() {} };
  const viewer = new TerraMountain.MountainViewer(fakeContainer);
  const issues = viewer.getDefaultPreviewIssues();

  assert.ok(Array.isArray(issues));
  assert.ok(issues.length >= 5);
  const regions = issues.map(i => i.terrainRegion);
  assert.ok(regions.includes('summit'));
  assert.ok(regions.includes('base-valley'));
  assert.ok(regions.includes('ridge-west'));
  assert.ok(regions.includes('plateau-south'));
});

test('Terrain Module: Camera presets set expected rotation parameters', () => {
  const fakeContainer = { innerHTML: '', appendChild() {} };
  const viewer = new TerraMountain.MountainViewer(fakeContainer);

  viewer.setPreset('summit');
  assert.strictEqual(viewer.targetRotation.x, 0.85);

  viewer.setPreset('ridge');
  assert.strictEqual(viewer.targetRotation.y, -1.45);

  viewer.setPreset('ortho');
  assert.strictEqual(viewer.targetRotation.x, 1.25);

  viewer.resetView();
  assert.strictEqual(viewer.targetRotation.x, 0.45);
  assert.strictEqual(viewer.targetRotation.y, -0.65);
});
