/* global output -- Maestro's GraalJS runtime */
// A message no earlier run has sent, so the flow can wait for exactly this one.
output.text = `Hello from Maestro ${new Date().toISOString().slice(11, 19)}`;
