// Rolling summary printer — one JSON line per tick to stderr.

/**
 * @returns {{ record(result: { ok: boolean, status: number }): void, tick(scenarioName: string, intervalMs: number): void, flush(): void }}
 */
export function createSummary() {
  let windowSent = 0;
  let windowErrors = 0;
  let windowHttp5xx = 0;
  let totalSent = 0;
  let totalErrors = 0;
  const startTime = Date.now();
  let windowStart = startTime;

  function record({ ok, status }) {
    totalSent++;
    windowSent++;
    if (!ok) {
      totalErrors++;
      windowErrors++;
    }
    if (status >= 500) {
      windowHttp5xx++;
    }
  }

  function tick(scenarioName, intervalMs) {
    const windowSec = intervalMs / 1000;
    const rate = windowSec > 0 ? Math.round(windowSent / windowSec) : 0;

    process.stderr.write(
      JSON.stringify({
        msg: 'summary',
        scenario: scenarioName,
        windowSec,
        sent: windowSent,
        errors: windowErrors,
        http5xx: windowHttp5xx,
        rate,
        totalSent,
        totalErrors,
      }) + '\n',
    );

    windowSent = 0;
    windowErrors = 0;
    windowHttp5xx = 0;
    windowStart = Date.now();
  }

  function flush() {
    const elapsedMs = Date.now() - windowStart;
    const windowSec = Math.round(elapsedMs / 1000);
    const rate = windowSec > 0 ? Math.round(windowSent / windowSec) : windowSent;

    process.stderr.write(
      JSON.stringify({
        msg: 'summary',
        scenario: 'final',
        windowSec,
        sent: windowSent,
        errors: windowErrors,
        http5xx: windowHttp5xx,
        rate,
        totalSent,
        totalErrors,
      }) + '\n',
    );
  }

  return { record, tick, flush };
}
