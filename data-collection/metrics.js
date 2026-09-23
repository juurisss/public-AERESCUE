(function(root, factory){
  const api = factory();
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AERESCUEDataMetrics = api;
})(globalThis, function(){
  function finite(value){ return typeof value === 'number' && Number.isFinite(value); }
  function percent(numerator, denominator){ return denominator > 0 ? 100 * numerator / denominator : null; }

  function summarize(values){
    const numbers = values.filter(finite);
    if(!numbers.length) return {n:0, mean:null, standardDeviation:null, min:null, max:null, rmse:null};
    const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    const variance = numbers.length > 1
      ? numbers.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (numbers.length - 1)
      : null;
    return {
      n: numbers.length,
      mean,
      standardDeviation: variance === null ? null : Math.sqrt(variance),
      min: Math.min(...numbers),
      max: Math.max(...numbers),
      rmse: Math.sqrt(numbers.reduce((sum, value) => sum + value * value, 0) / numbers.length)
    };
  }

  function absoluteError(estimated, actual){
    return finite(estimated) && finite(actual) ? Math.abs(estimated - actual) : null;
  }

  function trackingSummary(observations){
    const total = observations.length;
    const cameraAValid = observations.filter(observation => observation.cameraAValid).length;
    const cameraBValid = observations.filter(observation => observation.cameraBValid).length;
    const bothValid = observations.filter(observation => observation.bothValid).length;
    const elapsed = observations.map(observation => observation.elapsedTime).filter(finite);
    return {
      totalObservations: total,
      cameraAValidObservations: cameraAValid,
      cameraBValidObservations: cameraBValid,
      bothValidObservations: bothValid,
      cameraASuccessPercent: percent(cameraAValid, total),
      cameraBSuccessPercent: percent(cameraBValid, total),
      bothValidPercent: percent(bothValid, total),
      durationSeconds: elapsed.length ? Math.max(...elapsed) : null
    };
  }

  function confusionMatrix(records, labels){
    const matrix = Object.fromEntries(labels.map(expected => [expected, Object.fromEntries(labels.map(generated => [generated, 0]))]));
    records.forEach(record => {
      if(matrix[record.expectedOutput] && Object.prototype.hasOwnProperty.call(matrix[record.expectedOutput], record.generatedOutput)){
        matrix[record.expectedOutput][record.generatedOutput] += 1;
      }
    });
    return matrix;
  }

  return {finite, percent, summarize, absoluteError, trackingSummary, confusionMatrix};
});
