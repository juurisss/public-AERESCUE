const assert = require('node:assert/strict');
const metrics = require('../data-collection/metrics.js');

const summary = metrics.summarize([1, 2, 3]);
assert.equal(summary.n, 3);
assert.equal(summary.mean, 2);
assert.equal(summary.min, 1);
assert.equal(summary.max, 3);
assert.ok(Math.abs(summary.rmse - Math.sqrt(14 / 3)) < 1e-12);
assert.equal(metrics.absoluteError(2.5, 2), 0.5);
assert.equal(metrics.absoluteError(null, 2), null);
assert.equal(metrics.percent(1, 0), null);

const tracking = metrics.trackingSummary([
  {cameraAValid:true, cameraBValid:false, bothValid:false, elapsedTime:0},
  {cameraAValid:true, cameraBValid:true, bothValid:true, elapsedTime:0.25},
]);
assert.equal(tracking.totalObservations, 2);
assert.equal(tracking.cameraASuccessPercent, 100);
assert.equal(tracking.cameraBSuccessPercent, 50);
assert.equal(tracking.bothValidPercent, 50);

const matrix = metrics.confusionMatrix([
  {expectedOutput:'LEFT', generatedOutput:'LEFT'},
  {expectedOutput:'LEFT', generatedOutput:'RIGHT'},
], ['LEFT', 'RIGHT']);
assert.equal(matrix.LEFT.LEFT, 1);
assert.equal(matrix.LEFT.RIGHT, 1);

console.log('Data collection metric checks passed.');
