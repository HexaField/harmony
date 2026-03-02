var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// ../../node_modules/.pnpm/@cloudflare+unenv-preset@2.14.0_unenv@2.0.0-rc.24_workerd@1.20260302.0/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// ../../node_modules/.pnpm/@cloudflare+unenv-preset@2.14.0_unenv@2.0.0-rc.24_workerd@1.20260302.0/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// ../../node_modules/.pnpm/wrangler@4.68.0_@cloudflare+workers-types@4.20260303.0/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// ../../node_modules/.pnpm/@cloudflare+unenv-preset@2.14.0_unenv@2.0.0-rc.24_workerd@1.20260302.0/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  _channel,
  _debugEnd,
  _debugProcess,
  _disconnect,
  _events,
  _eventsCount,
  _exiting,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _handleQueue,
  _kill,
  _linkedBinding,
  _maxListeners,
  _pendingMessage,
  _preload_modules,
  _rawDebug,
  _send,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  assert: assert2,
  availableMemory,
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  disconnect,
  dlopen,
  domain,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  hrtime: hrtime3,
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  mainModule,
  memoryUsage,
  moduleLoadList,
  nextTick,
  off,
  on,
  once,
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// ../../node_modules/.pnpm/wrangler@4.68.0_@cloudflare+workers-types@4.20260303.0/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// ../protocol/src/messages.ts
var CLIENT_TO_SERVER_TYPES = [
  "channel.send",
  "channel.edit",
  "channel.delete",
  "channel.typing",
  "channel.reaction.add",
  "channel.reaction.remove",
  "dm.send",
  "dm.edit",
  "dm.delete",
  "dm.typing",
  "thread.create",
  "thread.send",
  "community.create",
  "community.update",
  "community.join",
  "community.leave",
  "channel.create",
  "channel.update",
  "channel.delete.admin",
  "role.create",
  "role.update",
  "role.delete",
  "role.assign",
  "role.remove",
  "channel.pin",
  "channel.unpin",
  "channel.pins.list",
  "member.update",
  "member.kick",
  "member.ban",
  "community.ban",
  "community.unban",
  "presence.update",
  "sync.request",
  "sync.state",
  "community.info",
  // Phase 3
  "voice.join",
  "voice.leave",
  "voice.state",
  "voice.mute",
  "voice.unmute",
  "voice.video",
  "voice.screen",
  "voice.token",
  "media.upload.request",
  "media.upload.complete",
  "media.delete",
  "search.metadata",
  "bot.install",
  "bot.uninstall",
  "bot.action",
  "governance.propose",
  "governance.sign",
  "governance.execute",
  "governance.contest",
  "governance.cancel",
  "delegation.create",
  "delegation.revoke",
  "credential.issue",
  "credential.present",
  "credential.verify",
  // E2EE / MLS
  "mls.keypackage.upload",
  "mls.keypackage.fetch",
  "mls.commit",
  "mls.group.setup",
  // Notifications
  "notification.list",
  "notification.mark-read",
  "notification.count",
  // Moderation
  "moderation.config.update",
  "moderation.config.get",
  // Voice — CF SFU
  "voice.session.create",
  "voice.tracks.push",
  "voice.tracks.pull",
  "voice.tracks.close",
  "voice.renegotiate"
];
var SERVER_TO_CLIENT_TYPES = [
  "channel.message",
  "channel.message.updated",
  "channel.message.deleted",
  "channel.typing.indicator",
  "channel.reaction.added",
  "channel.reaction.removed",
  "dm.message",
  "dm.message.updated",
  "dm.message.deleted",
  "dm.typing.indicator",
  "thread.message",
  "thread.created",
  "community.updated",
  "community.member.joined",
  "community.member.left",
  "community.member.updated",
  "community.member.kicked",
  "community.member.banned",
  "community.ban.applied",
  "community.unban.applied",
  "community.member.reconciled",
  "community.auto-joined",
  "channel.created",
  "channel.updated",
  "channel.deleted",
  "role.created",
  "role.updated",
  "role.deleted",
  "channel.message.pinned",
  "channel.message.unpinned",
  "channel.pins.response",
  "presence.changed",
  "sync.response",
  "community.info.response",
  "error",
  // Phase 3
  "voice.participant.joined",
  "voice.participant.left",
  "voice.speaking",
  "voice.offer",
  "voice.answer",
  "voice.ice",
  "voice.token.response",
  "search.metadata.result",
  "bot.event",
  // E2EE / MLS
  "mls.keypackage.response",
  "mls.welcome",
  // Notifications
  "notification.list.response",
  "notification.count.response",
  "notification.new",
  // Moderation
  "moderation.config.response",
  "moderation.raid-detected",
  // Voice — CF SFU
  "voice.session.created",
  "voice.tracks.pushed",
  "voice.tracks.pulled",
  "voice.tracks.closed",
  "voice.renegotiated",
  "voice.track.published",
  "voice.track.removed"
];
var FEDERATION_TYPES = ["federation.relay", "federation.sync", "federation.presence"];
var ALL_MESSAGE_TYPES = [
  ...CLIENT_TO_SERVER_TYPES,
  ...SERVER_TO_CLIENT_TYPES,
  ...FEDERATION_TYPES
];

// ../protocol/src/serialisation.ts
var BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function uint8ArrayToBase64(bytes) {
  let result = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += BASE64_CHARS[b0 >> 2 & 63];
    result += BASE64_CHARS[(b0 << 4 | b1 >> 4) & 63];
    result += i + 1 < len ? BASE64_CHARS[(b1 << 2 | b2 >> 6) & 63] : "=";
    result += i + 2 < len ? BASE64_CHARS[b2 & 63] : "=";
  }
  return result;
}
__name(uint8ArrayToBase64, "uint8ArrayToBase64");
function base64ToUint8Array(base64) {
  const clean = base64.replace(/=/g, "");
  const len = clean.length;
  const bytes = new Uint8Array(Math.floor(len * 3 / 4));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = BASE64_CHARS.indexOf(clean[i]);
    const c1 = i + 1 < len ? BASE64_CHARS.indexOf(clean[i + 1]) : 0;
    const c2 = i + 2 < len ? BASE64_CHARS.indexOf(clean[i + 2]) : 0;
    const c3 = i + 3 < len ? BASE64_CHARS.indexOf(clean[i + 3]) : 0;
    bytes[p++] = c0 << 2 | c1 >> 4;
    if (i + 2 < len) bytes[p++] = (c1 << 4 | c2 >> 2) & 255;
    if (i + 3 < len) bytes[p++] = (c2 << 6 | c3) & 255;
  }
  return bytes.slice(0, p);
}
__name(base64ToUint8Array, "base64ToUint8Array");
function replacer(_key, value) {
  if (value instanceof Uint8Array) {
    return { __type: "Uint8Array", data: uint8ArrayToBase64(value) };
  }
  return value;
}
__name(replacer, "replacer");
function reviver(_key, value) {
  if (value && typeof value === "object" && value.__type === "Uint8Array" && typeof value.data === "string") {
    return base64ToUint8Array(value.data);
  }
  return value;
}
__name(reviver, "reviver");
function serialise(data) {
  return JSON.stringify(data, replacer);
}
__name(serialise, "serialise");
function deserialise(json) {
  return JSON.parse(json, reviver);
}
__name(deserialise, "deserialise");

// src/auth.ts
function extractDID(vp) {
  return vp.holder || null;
}
__name(extractDID, "extractDID");
function parseVP(json) {
  try {
    const parsed = JSON.parse(json);
    if (parsed.type?.includes("VerifiablePresentation") && parsed.holder) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
__name(parseVP, "parseVP");
function extractPublicKeyFromDIDKey(did) {
  if (!did.startsWith("did:key:z")) return null;
  try {
    const multibaseEncoded = did.slice(8);
    const decoded = base58Decode(multibaseEncoded.slice(1));
    if (decoded[0] === 237 && decoded[1] === 1) {
      return decoded.slice(2);
    }
    return null;
  } catch {
    return null;
  }
}
__name(extractPublicKeyFromDIDKey, "extractPublicKeyFromDIDKey");
async function verifyEd25519Signature(publicKeyBytes, signatureBytes, messageBytes) {
  try {
    const keyBuffer = publicKeyBytes.buffer.slice(
      publicKeyBytes.byteOffset,
      publicKeyBytes.byteOffset + publicKeyBytes.byteLength
    );
    const key = await crypto.subtle.importKey("raw", keyBuffer, { name: "Ed25519" }, false, ["verify"]);
    const sigBuffer = signatureBytes.buffer.slice(
      signatureBytes.byteOffset,
      signatureBytes.byteOffset + signatureBytes.byteLength
    );
    const msgBuffer = messageBytes.buffer.slice(
      messageBytes.byteOffset,
      messageBytes.byteOffset + messageBytes.byteLength
    );
    return await crypto.subtle.verify("Ed25519", key, sigBuffer, msgBuffer);
  } catch {
    return false;
  }
}
__name(verifyEd25519Signature, "verifyEd25519Signature");
async function verifyVP(vp) {
  const did = extractDID(vp);
  if (!did) return null;
  const proof = vp.proof;
  if (!proof || proof.type !== "Ed25519Signature2020") return null;
  const publicKeyBytes = extractPublicKeyFromDIDKey(did);
  if (!publicKeyBytes) return null;
  const signatureBytes = base64ToUint8Array(proof.proofValue);
  const vpWithoutProof = { ...vp, proof: void 0 };
  const messageBytes = new TextEncoder().encode(JSON.stringify(vpWithoutProof));
  const valid = await verifyEd25519Signature(publicKeyBytes, signatureBytes, messageBytes);
  return valid ? did : null;
}
__name(verifyVP, "verifyVP");
var BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(input) {
  let num = BigInt(0);
  for (const char of input) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx < 0) throw new Error("Invalid base58 character");
    num = num * 58n + BigInt(idx);
  }
  const hex = num.toString(16).padStart(2, "0");
  const paddedHex = hex.length % 2 ? "0" + hex : hex;
  const result = [];
  for (const char of input) {
    if (char === "1") result.push(0);
    else break;
  }
  for (let i = 0; i < paddedHex.length; i += 2) {
    result.push(parseInt(paddedHex.slice(i, i + 2), 16));
  }
  return new Uint8Array(result);
}
__name(base58Decode, "base58Decode");

// src/provisioning.ts
async function handleProvisioningRequest(request, env2) {
  const url = new URL(request.url);
  const method = request.method;
  if (method === "POST" && url.pathname === "/api/instances") {
    return handleCreate(request, env2);
  }
  if (method === "GET" && url.pathname === "/api/instances") {
    const ownerDID = url.searchParams.get("owner");
    if (!ownerDID) return Response.json({ error: "Missing owner param" }, { status: 400 });
    return handleList(ownerDID, env2);
  }
  if (method === "DELETE" && url.pathname.startsWith("/api/instances/")) {
    const id = url.pathname.split("/")[3];
    if (!id) return new Response("Missing instance ID", { status: 400 });
    return handleDelete(id, request, env2);
  }
  if (method === "GET" && url.pathname.endsWith("/health")) {
    const id = url.pathname.split("/")[3];
    if (!id) return new Response("Missing instance ID", { status: 400 });
    return handleHealth(id, env2);
  }
  return new Response("Not found", { status: 404 });
}
__name(handleProvisioningRequest, "handleProvisioningRequest");
async function handleCreate(request, env2) {
  const body = await request.json();
  if (!body.name || !body.ownerDID) {
    return Response.json({ error: "Missing name or ownerDID" }, { status: 400 });
  }
  const instance = await createInstance(env2.DB, body);
  return Response.json(instance, { status: 201 });
}
__name(handleCreate, "handleCreate");
async function handleList(ownerDID, env2) {
  const instances = await listInstances(env2.DB, ownerDID);
  return Response.json(instances);
}
__name(handleList, "handleList");
async function handleDelete(id, request, env2) {
  const auth = request.headers.get("Authorization");
  if (!auth) return new Response("Unauthorized", { status: 401 });
  if (!auth.startsWith("Bearer ")) {
    return new Response("Invalid authorization", { status: 403 });
  }
  const token = auth.slice(7);
  const dotIndex = token.indexOf(".");
  if (dotIndex < 0) {
    return new Response("Invalid token format: expected <did>.<base64-signature>", { status: 403 });
  }
  const did = token.slice(0, dotIndex);
  const signatureB64 = token.slice(dotIndex + 1);
  if (!did.startsWith("did:key:")) {
    return new Response("Only did:key DIDs are supported", { status: 403 });
  }
  const row = await env2.DB.prepare("SELECT owner_did FROM instances WHERE id = ? AND status != ?").bind(id, "deleted").first();
  if (!row) {
    return new Response("Instance not found", { status: 404 });
  }
  if (row.owner_did !== did) {
    return new Response("Forbidden: not the instance owner", { status: 403 });
  }
  const publicKeyBytes = extractPublicKeyFromDIDKey(did);
  if (!publicKeyBytes) {
    return new Response("Could not extract public key from DID", { status: 403 });
  }
  const signatureBytes = base64ToUint8Array(signatureB64);
  const messageBytes = new TextEncoder().encode(id);
  const valid = await verifyEd25519Signature(publicKeyBytes, signatureBytes, messageBytes);
  if (!valid) {
    return new Response("Signature verification failed", { status: 403 });
  }
  await deleteInstance(env2.DB, id);
  return new Response(null, { status: 204 });
}
__name(handleDelete, "handleDelete");
async function handleHealth(id, env2) {
  const doId = env2.COMMUNITY.idFromName(id);
  const stub = env2.COMMUNITY.get(doId);
  const healthReq = new Request("https://internal/health");
  const res = await stub.fetch(healthReq);
  return res;
}
__name(handleHealth, "handleHealth");
async function createInstance(db, params) {
  const id = crypto.randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await db.prepare("INSERT INTO instances (id, name, owner_did, created_at, status) VALUES (?, ?, ?, ?, ?)").bind(id, params.name, params.ownerDID, now, "active").run();
  return {
    id,
    name: params.name,
    ownerDID: params.ownerDID,
    status: "active",
    createdAt: now,
    serverUrl: `/ws/${id}`
  };
}
__name(createInstance, "createInstance");
async function listInstances(db, ownerDID) {
  const result = await db.prepare("SELECT id, name, owner_did, created_at, status FROM instances WHERE owner_did = ? AND status != ?").bind(ownerDID, "deleted").all();
  return (result.results || []).map((row) => ({
    id: row.id,
    name: row.name,
    ownerDID: row.owner_did,
    status: row.status,
    createdAt: row.created_at,
    serverUrl: `/ws/${row.id}`
  }));
}
__name(listInstances, "listInstances");
async function deleteInstance(db, id) {
  await db.prepare("UPDATE instances SET status = 'deleted' WHERE id = ?").bind(id).run();
}
__name(deleteInstance, "deleteInstance");

// src/community-do.ts
import { DurableObject } from "cloudflare:workers";

// ../vocab/src/index.ts
var HARMONY = "https://harmony.example/vocab#";
var XSD = "http://www.w3.org/2001/XMLSchema#";
var RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
var RDFS = "http://www.w3.org/2000/01/rdf-schema#";
var HarmonyType = {
  Community: `${HARMONY}Community`,
  Channel: `${HARMONY}Channel`,
  Category: `${HARMONY}Category`,
  Thread: `${HARMONY}Thread`,
  Message: `${HARMONY}Message`,
  Role: `${HARMONY}Role`,
  Member: `${HARMONY}Member`,
  Reaction: `${HARMONY}Reaction`,
  // Phase 2 additions
  EncryptedMessage: `${HARMONY}EncryptedMessage`,
  DirectMessage: `${HARMONY}DirectMessage`,
  ThreadMessage: `${HARMONY}ThreadMessage`,
  Presence: `${HARMONY}Presence`,
  FederationPeer: `${HARMONY}FederationPeer`,
  ModerationAction: `${HARMONY}ModerationAction`,
  // Phase 3 additions
  VoiceRoom: `${HARMONY}VoiceRoom`,
  VoiceParticipant: `${HARMONY}VoiceParticipant`,
  MediaFile: `${HARMONY}MediaFile`,
  LinkPreview: `${HARMONY}LinkPreview`,
  Bot: `${HARMONY}Bot`,
  Webhook: `${HARMONY}Webhook`,
  InboundWebhook: `${HARMONY}InboundWebhook`,
  Proposal: `${HARMONY}Proposal`,
  Constitution: `${HARMONY}Constitution`,
  UserDelegation: `${HARMONY}UserDelegation`,
  AgentAuth: `${HARMONY}AgentAuth`,
  CredentialType: `${HARMONY}CredentialType`,
  Reputation: `${HARMONY}Reputation`,
  SearchIndex: `${HARMONY}SearchIndex`,
  MetadataIndex: `${HARMONY}MetadataIndex`,
  PushSubscription: `${HARMONY}PushSubscription`
};
var HarmonyPredicate = {
  author: `${HARMONY}author`,
  content: `${HARMONY}content`,
  timestamp: `${HARMONY}timestamp`,
  replyTo: `${HARMONY}replyTo`,
  inChannel: `${HARMONY}inChannel`,
  inCategory: `${HARMONY}inCategory`,
  parentThread: `${HARMONY}parentThread`,
  role: `${HARMONY}role`,
  community: `${HARMONY}community`,
  joinedAt: `${HARMONY}joinedAt`,
  permission: `${HARMONY}permission`,
  name: `${HARMONY}name`,
  description: `${HARMONY}description`,
  emoji: `${HARMONY}emoji`,
  reactor: `${HARMONY}reactor`,
  onMessage: `${HARMONY}onMessage`,
  // Phase 2 additions
  clock: `${HARMONY}clock`,
  nonce: `${HARMONY}nonce`,
  epoch: `${HARMONY}epoch`,
  ciphertextRef: `${HARMONY}ciphertextRef`,
  editedAt: `${HARMONY}editedAt`,
  deletedAt: `${HARMONY}deletedAt`,
  presenceStatus: `${HARMONY}presenceStatus`,
  customStatus: `${HARMONY}customStatus`,
  lastSeen: `${HARMONY}lastSeen`,
  peerEndpoint: `${HARMONY}peerEndpoint`,
  peerDID: `${HARMONY}peerDID`,
  federatedWith: `${HARMONY}federatedWith`,
  moderator: `${HARMONY}moderator`,
  moderationTarget: `${HARMONY}moderationTarget`,
  moderationReason: `${HARMONY}moderationReason`,
  moderationExpiry: `${HARMONY}moderationExpiry`,
  // Phase 3 additions — Voice
  maxParticipants: `${HARMONY}maxParticipants`,
  quality: `${HARMONY}quality`,
  speaking: `${HARMONY}speaking`,
  screenSharing: `${HARMONY}screenSharing`,
  e2eeEnabled: `${HARMONY}e2eeEnabled`,
  channelId: `${HARMONY}channelId`,
  // Phase 3 additions — Media
  filename: `${HARMONY}filename`,
  contentType: `${HARMONY}contentType`,
  encryptedSize: `${HARMONY}encryptedSize`,
  checksum: `${HARMONY}checksum`,
  thumbnailId: `${HARMONY}thumbnailId`,
  uploadedBy: `${HARMONY}uploadedBy`,
  // Phase 3 additions — Bot
  botDID: `${HARMONY}botDID`,
  botStatus: `${HARMONY}botStatus`,
  installedBy: `${HARMONY}installedBy`,
  // Phase 3 additions — Governance
  proposalStatus: `${HARMONY}proposalStatus`,
  quorumKind: `${HARMONY}quorumKind`,
  quorumThreshold: `${HARMONY}quorumThreshold`,
  votingPeriod: `${HARMONY}votingPeriod`,
  executionDelay: `${HARMONY}executionDelay`,
  contestPeriod: `${HARMONY}contestPeriod`,
  fromDID: `${HARMONY}fromDID`,
  toDID: `${HARMONY}toDID`,
  reason: `${HARMONY}reason`,
  agentDID: `${HARMONY}agentDID`,
  auditLevel: `${HARMONY}auditLevel`,
  maxActionsPerHour: `${HARMONY}maxActionsPerHour`,
  version: `${HARMONY}version`,
  // Phase 3 additions — Credentials
  issuerPolicy: `${HARMONY}issuerPolicy`,
  transferable: `${HARMONY}transferable`,
  badgeEmoji: `${HARMONY}badgeEmoji`,
  badgeColor: `${HARMONY}badgeColor`,
  aggregateScore: `${HARMONY}aggregateScore`,
  contributionScore: `${HARMONY}contributionScore`,
  messageCount: `${HARMONY}messageCount`,
  subject: `${HARMONY}subject`,
  score: `${HARMONY}score`,
  // Phase 3 additions — Mobile
  pushToken: `${HARMONY}pushToken`,
  pushPlatform: `${HARMONY}pushPlatform`,
  // Discord reconciliation
  discordId: `${HARMONY}discordId`,
  discordUsername: `${HARMONY}discordUsername`,
  did: `${HARMONY}did`
};
var HarmonyCredentialType = {
  DiscordIdentityCredential: `${HARMONY}DiscordIdentityCredential`,
  CommunityMembershipCredential: `${HARMONY}CommunityMembershipCredential`,
  EmailVerificationCredential: `${HARMONY}EmailVerificationCredential`,
  OAuthIdentityCredential: `${HARMONY}OAuthIdentityCredential`
};
var HarmonyAction = {
  SendMessage: `${HARMONY}SendMessage`,
  DeleteMessage: `${HARMONY}DeleteMessage`,
  AddReaction: `${HARMONY}AddReaction`,
  ManageChannel: `${HARMONY}ManageChannel`,
  ManageRoles: `${HARMONY}ManageRoles`,
  MuteUser: `${HARMONY}MuteUser`,
  BanUser: `${HARMONY}BanUser`,
  InviteMember: `${HARMONY}InviteMember`,
  RelayMessage: `${HARMONY}RelayMessage`,
  VerifyMembership: `${HARMONY}VerifyMembership`,
  // Phase 2 additions
  ReadChannel: `${HARMONY}ReadChannel`,
  CreateThread: `${HARMONY}CreateThread`,
  SendDM: `${HARMONY}SendDM`,
  ManageMembers: `${HARMONY}ManageMembers`,
  FederateRelay: `${HARMONY}FederateRelay`,
  FederateVerify: `${HARMONY}FederateVerify`,
  ModerateContent: `${HARMONY}ModerateContent`,
  // Phase 3 additions
  JoinVoice: `${HARMONY}JoinVoice`,
  ManageVoice: `${HARMONY}ManageVoice`,
  UploadMedia: `${HARMONY}UploadMedia`,
  DeleteMedia: `${HARMONY}DeleteMedia`,
  InstallBot: `${HARMONY}InstallBot`,
  ManageWebhooks: `${HARMONY}ManageWebhooks`,
  ProposeGovernance: `${HARMONY}ProposeGovernance`,
  VoteGovernance: `${HARMONY}VoteGovernance`,
  DelegateUser: `${HARMONY}DelegateUser`,
  AuthorizeAgent: `${HARMONY}AuthorizeAgent`,
  IssueCustomCredential: `${HARMONY}IssueCustomCredential`
};
var RDFPredicate = {
  type: `${RDF}type`,
  subClassOf: `${RDFS}subClassOf`
};
var XSDDatatype = {
  string: `${XSD}string`,
  dateTime: `${XSD}dateTime`,
  integer: `${XSD}integer`,
  boolean: `${XSD}boolean`
};

// src/do-quad-store.ts
var DOQuadStore = class {
  static {
    __name(this, "DOQuadStore");
  }
  sql;
  constructor(sql) {
    this.sql = sql;
  }
  add(quad) {
    this.sql.exec(
      "INSERT OR IGNORE INTO quads (subject, predicate, object, graph) VALUES (?, ?, ?, ?)",
      quad.subject,
      quad.predicate,
      quad.object,
      quad.graph
    );
  }
  addAll(quads) {
    for (const quad of quads) {
      this.add(quad);
    }
  }
  remove(quad) {
    this.sql.exec(
      "DELETE FROM quads WHERE subject = ? AND predicate = ? AND object = ? AND graph = ?",
      quad.subject,
      quad.predicate,
      quad.object,
      quad.graph
    );
  }
  removeBySubject(subject, graph) {
    if (graph !== void 0) {
      this.sql.exec("DELETE FROM quads WHERE subject = ? AND graph = ?", subject, graph);
    } else {
      this.sql.exec("DELETE FROM quads WHERE subject = ?", subject);
    }
  }
  match(pattern) {
    const conditions = [];
    const params = [];
    if (pattern.subject !== void 0) {
      conditions.push("subject = ?");
      params.push(pattern.subject);
    }
    if (pattern.predicate !== void 0) {
      conditions.push("predicate = ?");
      params.push(pattern.predicate);
    }
    if (pattern.object !== void 0) {
      conditions.push("object = ?");
      params.push(pattern.object);
    }
    if (pattern.graph !== void 0) {
      conditions.push("graph = ?");
      params.push(pattern.graph);
    }
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
    const cursor = this.sql.exec(`SELECT subject, predicate, object, graph FROM quads${where}`, ...params);
    const results = [];
    for (const row of cursor) {
      results.push({
        subject: row.subject,
        predicate: row.predicate,
        object: row.object,
        graph: row.graph
      });
    }
    return results;
  }
  /** Get single object value for a subject+predicate */
  getValue(subject, predicate, graph) {
    const pattern = { subject, predicate };
    if (graph !== void 0) pattern.graph = graph;
    const results = this.match(pattern);
    return results.length > 0 ? results[0].object : null;
  }
  count(pattern) {
    if (!pattern) {
      const cursor = this.sql.exec("SELECT COUNT(*) as cnt FROM quads");
      for (const row of cursor) return row.cnt;
      return 0;
    }
    return this.match(pattern).length;
  }
};

// src/community-do.ts
var MAX_CONTENT_LENGTH = 4e3;
var MAX_NAME_LENGTH = 100;
var MAX_TOPIC_LENGTH = 500;
var RATE_LIMIT_MAX = 50;
var RATE_LIMIT_WINDOW_MS = 1e4;
function validateDID(did) {
  if (typeof did !== "string" || !did.startsWith("did:")) return "Invalid DID format";
  return null;
}
__name(validateDID, "validateDID");
function validateStringLength(value, maxLength, fieldName) {
  if (value.length > maxLength) return `${fieldName} exceeds maximum length of ${maxLength}`;
  return null;
}
__name(validateStringLength, "validateStringLength");
function validateRequiredStrings(fields) {
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      return `Missing or empty required field: ${key}`;
    }
  }
  return null;
}
__name(validateRequiredStrings, "validateRequiredStrings");
var CommunityDurableObject = class extends DurableObject {
  static {
    __name(this, "CommunityDurableObject");
  }
  quadStore;
  communityId = null;
  constructor(ctx, env2) {
    super(ctx, env2);
    this.quadStore = new DOQuadStore(ctx.storage.sql);
    this.initSchema();
  }
  initSchema() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS quads (
        subject TEXT NOT NULL,
        predicate TEXT NOT NULL,
        object TEXT NOT NULL,
        graph TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (subject, predicate, object, graph)
      );
      CREATE INDEX IF NOT EXISTS idx_quads_graph ON quads(graph);
      CREATE INDEX IF NOT EXISTS idx_quads_subject ON quads(subject);

      CREATE TABLE IF NOT EXISTS members (
        did TEXT PRIMARY KEY,
        display_name TEXT,
        roles TEXT DEFAULT '[]',
        joined_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text',
        category_id TEXT,
        topic TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS voice_participants (
        room_id TEXT NOT NULL,
        did TEXT NOT NULL,
        audio_enabled INTEGER NOT NULL DEFAULT 1,
        video_enabled INTEGER NOT NULL DEFAULT 0,
        joined_at TEXT NOT NULL,
        PRIMARY KEY (room_id, did)
      );

      CREATE TABLE IF NOT EXISTS pins (channel_id TEXT NOT NULL, message_id TEXT NOT NULL, pinned_by TEXT NOT NULL, pinned_at TEXT NOT NULL, PRIMARY KEY (channel_id, message_id));
      CREATE TABLE IF NOT EXISTS banned_users (did TEXT PRIMARY KEY, banned_by TEXT NOT NULL, banned_at TEXT NOT NULL, reason TEXT);
      CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, parent_message_id TEXT NOT NULL, channel_id TEXT NOT NULL, name TEXT NOT NULL, creator_did TEXT NOT NULL, created_at TEXT NOT NULL, message_count INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, permissions TEXT NOT NULL DEFAULT '[]', position INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS member_roles (member_did TEXT NOT NULL, role_id TEXT NOT NULL, PRIMARY KEY (member_did, role_id));
      CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, recipient_did TEXT NOT NULL, type TEXT NOT NULL, from_did TEXT NOT NULL, community_id TEXT, channel_id TEXT, message_id TEXT, content TEXT, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS key_packages (did TEXT NOT NULL, package_data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS e2ee_groups (group_id TEXT PRIMARY KEY, creator_did TEXT NOT NULL, channel_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, filename TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, data TEXT NOT NULL, uploaded_by TEXT NOT NULL, channel_id TEXT NOT NULL, uploaded_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS moderation_rules (id TEXT PRIMARY KEY, type TEXT NOT NULL, config TEXT NOT NULL);

      CREATE TABLE IF NOT EXISTS voice_tracks (
        room_id TEXT NOT NULL,
        did TEXT NOT NULL,
        track_name TEXT NOT NULL,
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        media_type TEXT NOT NULL,
        PRIMARY KEY (room_id, did, track_name)
      );
    `);
  }
  async fetch(request) {
    const url = new URL(request.url);
    const pathCommunityId = url.pathname.split("/")[2] || url.searchParams.get("community");
    if (pathCommunityId) {
      if (this.communityId && this.communityId !== pathCommunityId) {
        return new Response("Community ID mismatch", { status: 403 });
      }
      this.communityId = pathCommunityId;
    }
    if (url.pathname === "/health") {
      const connections = this.ctx.getWebSockets().length;
      return Response.json({ status: "ok", connections });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, ["unauthenticated"]);
    server.serializeAttachment({
      did: "",
      authenticated: false,
      connectedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    this.ctx.storage.setAlarm(Date.now() + 3e4);
    return new Response(null, { status: 101, webSocket: client });
  }
  async alarm() {
    for (const ws of this.ctx.getWebSockets("unauthenticated")) {
      const meta = ws.deserializeAttachment();
      if (!meta.authenticated) {
        this.sendError(ws, "Authentication timeout");
        ws.close(4001, "Authentication timeout");
      }
    }
  }
  async webSocketMessage(ws, message) {
    const meta = ws.deserializeAttachment();
    const msgStr = typeof message === "string" ? message : new TextDecoder().decode(message);
    if (!meta.authenticated) {
      await this.handleAuth(ws, meta, msgStr);
      return;
    }
    const now = Date.now();
    const windowStart = meta.rateLimitWindowStart ?? now;
    if (now - windowStart > RATE_LIMIT_WINDOW_MS) {
      meta.rateLimitCounter = 1;
      meta.rateLimitWindowStart = now;
    } else {
      meta.rateLimitCounter = (meta.rateLimitCounter ?? 0) + 1;
    }
    ws.serializeAttachment(meta);
    if (meta.rateLimitCounter > RATE_LIMIT_MAX) {
      this.sendError(ws, "Rate limit exceeded", "RATE_LIMITED");
      return;
    }
    let msg;
    try {
      msg = deserialise(msgStr);
    } catch {
      this.sendError(ws, "Invalid message format");
      return;
    }
    await this.handleMessage(ws, meta, msg);
  }
  async webSocketClose(ws, _code, _reason, _wasClean) {
    const meta = ws.deserializeAttachment();
    if (meta.authenticated && meta.did) {
      this.broadcast(
        serialise({
          id: crypto.randomUUID(),
          type: "presence.changed",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          sender: "server",
          payload: { did: meta.did, status: "offline" }
        }),
        ws
      );
    }
  }
  async webSocketError(ws, _error) {
    ws.close(1011, "Internal error");
  }
  // ── Auth ──
  async handleAuth(ws, meta, msgStr) {
    const vp = parseVP(msgStr);
    if (!vp) {
      this.sendError(ws, "Expected VerifiablePresentation for authentication");
      ws.close(4001, "Invalid auth");
      return;
    }
    const did = await verifyVP(vp);
    if (!did) {
      this.sendError(ws, "VP verification failed");
      ws.close(4001, "Auth failed");
      return;
    }
    const didErr = validateDID(did);
    if (didErr) {
      this.sendError(ws, didErr);
      ws.close(4001, "Invalid DID");
      return;
    }
    if (this.isBanned(did)) {
      this.sendError(ws, "You are banned from this community");
      ws.close(4003, "Banned");
      return;
    }
    meta.did = did;
    meta.authenticated = true;
    ws.serializeAttachment(meta);
    this.ensureMember(did);
    ws.send(
      serialise({
        id: crypto.randomUUID(),
        type: "sync.response",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { authenticated: true, did }
      })
    );
    this.broadcast(
      serialise({
        id: crypto.randomUUID(),
        type: "presence.changed",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { did, status: "online" }
      }),
      ws
    );
  }
  // ── Message Handling ──
  async handleMessage(ws, meta, msg) {
    const payload = msg.payload;
    if (payload && typeof payload.communityId === "string" && this.communityId) {
      if (payload.communityId !== this.communityId) {
        this.sendError(
          ws,
          `Community ID mismatch: message targets '${payload.communityId}' but this DO owns '${this.communityId}'`
        );
        return;
      }
    }
    switch (msg.type) {
      case "channel.send":
        await this.handleChannelSend(ws, meta, msg);
        break;
      case "channel.edit":
        await this.handleChannelEdit(ws, meta, msg);
        break;
      case "channel.delete":
        await this.handleChannelDelete(meta, msg);
        break;
      case "channel.typing":
        this.handleChannelTyping(meta, msg);
        break;
      case "community.create":
        await this.handleCommunityCreate(ws, meta, msg);
        break;
      case "community.join":
        await this.handleCommunityJoin(ws, meta, msg);
        break;
      case "community.leave":
        await this.handleCommunityLeave(meta, msg);
        break;
      case "channel.create":
        await this.handleChannelCreate(ws, meta, msg);
        break;
      case "presence.update":
        this.handlePresenceUpdate(meta, msg);
        break;
      case "sync.request":
        await this.handleSyncRequest(ws, meta);
        break;
      case "voice.join":
        await this.handleVoiceJoin(ws, meta, msg);
        break;
      case "voice.leave":
        await this.handleVoiceLeave(ws, meta, msg);
        break;
      case "voice.mute":
        await this.handleVoiceMute(ws, meta, msg);
        break;
      case "channel.update":
        this.handleChannelUpdate(ws, meta, msg);
        break;
      case "channel.delete.admin":
        this.handleChannelDeleteAdmin(ws, meta, msg);
        break;
      case "channel.pin":
        this.handleChannelPin(ws, meta, msg);
        break;
      case "channel.unpin":
        this.handleChannelUnpin(ws, meta, msg);
        break;
      case "channel.pins.list":
        this.handleChannelPinsList(ws, meta, msg);
        break;
      case "channel.reaction.add":
        this.handleChannelReactionAdd(meta, msg);
        break;
      case "channel.reaction.remove":
        this.handleChannelReactionRemove(meta, msg);
        break;
      case "channel.history":
        this.handleChannelHistory(ws, msg);
        break;
      case "community.update":
        this.handleCommunityUpdate(ws, meta, msg);
        break;
      case "community.info":
        this.handleCommunityInfo(ws, msg);
        break;
      case "community.list":
        this.handleCommunityList(ws, msg);
        break;
      case "community.ban":
        this.handleCommunityBan(ws, meta, msg);
        break;
      case "community.unban":
        this.handleCommunityUnban(ws, meta, msg);
        break;
      case "community.kick":
        this.handleCommunityKick(ws, meta, msg);
        break;
      case "community.member.reconciled":
        ws.send(
          serialise({
            id: msg.id,
            type: "community.member.reconciled.ack",
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            sender: "server",
            payload: {}
          })
        );
        break;
      case "dm.send":
        this.handleDmSend(ws, meta, msg);
        break;
      case "dm.edit":
        this.handleDmEdit(ws, meta, msg);
        break;
      case "dm.delete":
        this.handleDmDelete(ws, meta, msg);
        break;
      case "dm.typing":
        this.handleDmTyping(ws, meta, msg);
        break;
      case "dm.keyexchange":
        this.handleDmKeyexchange(ws, meta, msg);
        break;
      case "thread.create":
        this.handleThreadCreate(meta, msg);
        break;
      case "thread.send":
        this.handleThreadSend(meta, msg);
        break;
      case "role.create":
        this.handleRoleCreate(ws, meta, msg);
        break;
      case "role.update":
        this.handleRoleUpdate(ws, meta, msg);
        break;
      case "role.delete":
        this.handleRoleDelete(ws, meta, msg);
        break;
      case "role.assign":
        this.handleRoleAssign(ws, meta, msg);
        break;
      case "role.remove":
        this.handleRoleRemove(ws, meta, msg);
        break;
      case "member.update":
        this.handleMemberUpdate(meta, msg);
        break;
      case "search.query":
        this.handleSearchQuery(ws, msg);
        break;
      case "media.upload.request":
        this.handleMediaUploadRequest(ws, meta, msg);
        break;
      case "media.delete":
        this.handleMediaDelete(ws, meta, msg);
        break;
      case "mls.keypackage.upload":
        this.handleMlsKeypackageUpload(meta, msg);
        break;
      case "mls.keypackage.fetch":
        this.handleMlsKeypackageFetch(ws, msg);
        break;
      case "mls.welcome":
        this.handleMlsWelcome(ws, meta, msg);
        break;
      case "mls.commit":
        this.handleMlsCommit(ws, meta, msg);
        break;
      case "mls.group.setup":
        this.handleMlsGroupSetup(ws, meta, msg);
        break;
      case "mls.member.joined":
        break;
      case "moderation.config.update":
        this.handleModerationConfigUpdate(ws, meta, msg);
        break;
      case "moderation.config.get":
        this.handleModerationConfigGet(ws, msg);
        break;
      case "notification.list":
        this.handleNotificationList(ws, meta);
        break;
      case "notification.mark-read":
        this.handleNotificationMarkRead(ws, meta, msg);
        break;
      case "notification.count":
        this.handleNotificationCount(ws, meta);
        break;
      case "voice.unmute":
        await this.handleVoiceMute(ws, meta, msg);
        break;
      case "voice.offer":
      case "voice.answer":
      case "voice.ice":
        this.handleVoiceSignaling(ws, meta, msg);
        break;
      case "voice.video":
        this.handleVoiceVideo(meta, msg);
        break;
      case "voice.screen":
        this.handleVoiceScreen(meta, msg);
        break;
      case "voice.speaking":
        this.handleVoiceSpeaking(ws, meta, msg);
        break;
      case "voice.token":
        this.handleVoiceToken(ws, msg);
        break;
      case "voice.session.create":
        this.handleVoiceSessionCreate(ws, meta, msg);
        break;
      case "voice.tracks.push":
        this.handleVoiceTracksPush(ws, msg);
        break;
      case "voice.tracks.pull":
        this.handleVoiceTracksPull(ws, msg);
        break;
      case "voice.renegotiate":
        this.handleVoiceRenegotiate(ws, msg);
        break;
      case "voice.transport.connect":
      case "voice.transport.connect-recv":
      case "voice.transport.create-recv":
      case "voice.produce":
      case "voice.consume":
      case "voice.consumer.resume":
        this.sendError(ws, "NO_SFU: SFU mode not available in cloud worker");
        break;
      case "voice.get-producers":
        this.handleVoiceGetProducers(ws, meta, msg);
        break;
      case "voice.track.published":
        this.handleVoiceTrackPublished(ws, meta, msg);
        break;
      case "voice.track.removed":
        this.handleVoiceTrackRemoved(ws, meta, msg);
        break;
      case "voice.tracks.close":
        this.handleVoiceTracksClose(ws, msg);
        break;
      case "voice.producer-closed":
        this.handleVoiceProducerClosed(ws, meta, msg);
        break;
      default:
        this.sendError(ws, `Unsupported message type: ${msg.type}`);
    }
  }
  async handleChannelSend(ws, meta, msg) {
    const payload = msg.payload;
    const contentStr = typeof payload.content === "string" ? payload.content : JSON.stringify(payload.content);
    const lengthErr = validateStringLength(contentStr, MAX_CONTENT_LENGTH, "content");
    if (lengthErr) {
      this.sendError(ws, lengthErr);
      return;
    }
    const graph = `${payload.communityId}:${payload.channelId}`;
    this.quadStore.addAll([
      { subject: msg.id, predicate: "rdf:type", object: HarmonyType.Message, graph },
      { subject: msg.id, predicate: HarmonyPredicate.author, object: meta.did, graph },
      { subject: msg.id, predicate: HarmonyPredicate.timestamp, object: msg.timestamp, graph },
      { subject: msg.id, predicate: HarmonyPredicate.inChannel, object: payload.channelId, graph },
      { subject: msg.id, predicate: HarmonyPredicate.community, object: payload.communityId, graph },
      { subject: msg.id, predicate: `${HARMONY}content`, object: JSON.stringify(payload.content), graph }
    ]);
    this.broadcast(
      serialise({
        id: msg.id,
        type: "channel.message",
        timestamp: msg.timestamp,
        sender: meta.did,
        payload
      })
    );
  }
  async handleChannelEdit(_unused, meta, msg) {
    const payload = msg.payload;
    const graph = `${payload.communityId}:${payload.channelId}`;
    const author = this.quadStore.getValue(payload.messageId, HarmonyPredicate.author, graph);
    if (author !== meta.did) return;
    const oldContent = this.quadStore.getValue(payload.messageId, `${HARMONY}content`, graph);
    if (oldContent !== null) {
      this.quadStore.remove({
        subject: payload.messageId,
        predicate: `${HARMONY}content`,
        object: oldContent,
        graph
      });
    }
    this.quadStore.add({
      subject: payload.messageId,
      predicate: `${HARMONY}content`,
      object: JSON.stringify(payload.content),
      graph
    });
    this.broadcast(
      serialise({
        id: msg.id,
        type: "channel.message.updated",
        timestamp: msg.timestamp,
        sender: meta.did,
        payload
      })
    );
  }
  async handleChannelDelete(meta, msg) {
    const payload = msg.payload;
    const graph = `${payload.communityId}:${payload.channelId}`;
    const author = this.quadStore.getValue(payload.messageId, HarmonyPredicate.author, graph);
    if (author !== meta.did) return;
    this.quadStore.removeBySubject(payload.messageId, graph);
    this.broadcast(
      serialise({
        id: msg.id,
        type: "channel.message.deleted",
        timestamp: msg.timestamp,
        sender: meta.did,
        payload
      })
    );
  }
  handleChannelTyping(meta, msg) {
    this.broadcast(
      serialise({
        id: msg.id,
        type: "channel.typing.indicator",
        timestamp: msg.timestamp,
        sender: meta.did,
        payload: msg.payload
      })
    );
  }
  async handleCommunityCreate(ws, meta, msg) {
    const payload = msg.payload;
    const reqErr = validateRequiredStrings({ name: payload.name });
    if (reqErr) {
      this.sendError(ws, reqErr);
      return;
    }
    const nameErr = validateStringLength(payload.name, MAX_NAME_LENGTH, "name");
    if (nameErr) {
      this.sendError(ws, nameErr);
      return;
    }
    const communityId = this.communityId || crypto.randomUUID();
    if (!this.communityId) this.communityId = communityId;
    this.quadStore.addAll([
      { subject: communityId, predicate: "rdf:type", object: HarmonyType.Community, graph: communityId },
      { subject: communityId, predicate: HarmonyPredicate.name, object: payload.name, graph: communityId },
      {
        subject: communityId,
        predicate: `${HARMONY}creator`,
        object: meta.did,
        graph: communityId
      },
      {
        subject: communityId,
        predicate: HarmonyPredicate.timestamp,
        object: (/* @__PURE__ */ new Date()).toISOString(),
        graph: communityId
      }
    ]);
    if (payload.description) {
      this.quadStore.add({
        subject: communityId,
        predicate: `${HARMONY}description`,
        object: payload.description,
        graph: communityId
      });
    }
    this.ensureMember(meta.did);
    const channelId = crypto.randomUUID();
    this.ctx.storage.sql.exec(
      "INSERT INTO channels (id, name, type, created_at) VALUES (?, 'general', 'text', ?)",
      channelId,
      (/* @__PURE__ */ new Date()).toISOString()
    );
    ws.send(
      serialise({
        id: msg.id,
        type: "community.updated",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { communityId, name: payload.name, channelId }
      })
    );
  }
  async handleCommunityJoin(ws, meta, msg) {
    this.ensureMember(meta.did);
    this.broadcast(
      serialise({
        id: msg.id,
        type: "community.member.joined",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { did: meta.did }
      })
    );
    await this.handleSyncRequest(ws, meta);
  }
  async handleCommunityLeave(meta, msg) {
    this.ctx.storage.sql.exec("DELETE FROM members WHERE did = ?", meta.did);
    this.broadcast(
      serialise({
        id: msg.id,
        type: "community.member.left",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { did: meta.did }
      })
    );
  }
  async handleChannelCreate(ws, meta, msg) {
    const payload = msg.payload;
    const reqErr = validateRequiredStrings({ name: payload.name });
    if (reqErr) {
      this.sendError(ws, reqErr);
      return;
    }
    const nameErr = validateStringLength(payload.name, MAX_NAME_LENGTH, "name");
    if (nameErr) {
      this.sendError(ws, nameErr);
      return;
    }
    if (payload.topic) {
      const topicErr = validateStringLength(payload.topic, MAX_TOPIC_LENGTH, "topic");
      if (topicErr) {
        this.sendError(ws, topicErr);
        return;
      }
    }
    const channelId = crypto.randomUUID();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.ctx.storage.sql.exec(
      "INSERT INTO channels (id, name, type, category_id, topic, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      channelId,
      payload.name,
      payload.type || "text",
      payload.categoryId || null,
      payload.topic || null,
      now
    );
    this.broadcast(
      serialise({
        id: msg.id,
        type: "channel.created",
        timestamp: now,
        sender: meta.did,
        payload: { channelId, ...payload }
      })
    );
  }
  handlePresenceUpdate(meta, msg) {
    this.broadcast(
      serialise({
        id: msg.id,
        type: "presence.changed",
        timestamp: msg.timestamp,
        sender: meta.did,
        payload: { did: meta.did, ...msg.payload }
      })
    );
  }
  async handleSyncRequest(ws, _unused) {
    const members = [];
    for (const row of this.ctx.storage.sql.exec("SELECT did, display_name, roles, joined_at FROM members")) {
      members.push({
        did: row.did,
        displayName: row.display_name,
        roles: row.roles,
        joinedAt: row.joined_at
      });
    }
    const channels = [];
    for (const row of this.ctx.storage.sql.exec("SELECT id, name, type, category_id, topic FROM channels")) {
      channels.push({
        id: row.id,
        name: row.name,
        type: row.type,
        categoryId: row.category_id,
        topic: row.topic
      });
    }
    ws.send(
      serialise({
        id: crypto.randomUUID(),
        type: "sync.response",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { members, channels }
      })
    );
  }
  // ── Voice ──
  async handleVoiceJoin(ws, meta, msg) {
    const payload = msg.payload;
    const roomId = payload.channelId;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO voice_participants (room_id, did, audio_enabled, video_enabled, joined_at) VALUES (?, ?, ?, ?, ?)",
      roomId,
      meta.did,
      payload.audioEnabled !== false ? 1 : 0,
      payload.videoEnabled ? 1 : 0,
      now
    );
    const participants = this.getVoiceParticipants(roomId);
    ws.send(
      serialise({
        id: msg.id,
        type: "voice.joined",
        timestamp: now,
        sender: "server",
        payload: { channelId: roomId, participants }
      })
    );
    this.broadcast(
      serialise({
        id: crypto.randomUUID(),
        type: "voice.participant.joined",
        timestamp: now,
        sender: "server",
        payload: {
          channelId: roomId,
          did: meta.did,
          audioEnabled: payload.audioEnabled !== false,
          videoEnabled: payload.videoEnabled ?? false
        }
      }),
      ws
    );
  }
  async handleVoiceLeave(_ws, meta, msg) {
    const payload = msg.payload;
    const roomId = payload.channelId;
    this.ctx.storage.sql.exec("DELETE FROM voice_participants WHERE room_id = ? AND did = ?", roomId, meta.did);
    this.ctx.storage.sql.exec("DELETE FROM voice_tracks WHERE room_id = ? AND did = ?", roomId, meta.did);
    this.broadcast(
      serialise({
        id: msg.id,
        type: "voice.participant.left",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { channelId: roomId, did: meta.did }
      })
    );
    const remaining = this.getVoiceParticipants(roomId);
    if (remaining.length === 0) {
    }
  }
  async handleVoiceMute(_ws, meta, msg) {
    const payload = msg.payload;
    const roomId = payload.channelId;
    if (payload.trackKind === "audio") {
      this.ctx.storage.sql.exec(
        "UPDATE voice_participants SET audio_enabled = ? WHERE room_id = ? AND did = ?",
        payload.muted ? 0 : 1,
        roomId,
        meta.did
      );
    } else {
      this.ctx.storage.sql.exec(
        "UPDATE voice_participants SET video_enabled = ? WHERE room_id = ? AND did = ?",
        payload.muted ? 0 : 1,
        roomId,
        meta.did
      );
    }
    this.broadcast(
      serialise({
        id: msg.id,
        type: "voice.participant.muted",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: {
          channelId: roomId,
          did: meta.did,
          trackKind: payload.trackKind,
          muted: payload.muted
        }
      })
    );
  }
  getVoiceParticipants(roomId) {
    const result = [];
    for (const row of this.ctx.storage.sql.exec(
      "SELECT did, audio_enabled, video_enabled, joined_at FROM voice_participants WHERE room_id = ?",
      roomId
    )) {
      result.push({
        did: row.did,
        audioEnabled: row.audio_enabled === 1,
        videoEnabled: row.video_enabled === 1,
        joinedAt: row.joined_at
      });
    }
    return result;
  }
  // ── Channel (additional) ──
  handleChannelUpdate(ws, meta, msg) {
    const payload = msg.payload;
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, "Not authorized");
      return;
    }
    if (payload.name !== void 0) {
      this.ctx.storage.sql.exec("UPDATE channels SET name = ? WHERE id = ?", payload.name, payload.channelId);
    }
    if (payload.topic !== void 0) {
      this.ctx.storage.sql.exec("UPDATE channels SET topic = ? WHERE id = ?", payload.topic, payload.channelId);
    }
    this.broadcast(
      serialise({ id: msg.id, type: "channel.updated", timestamp: (/* @__PURE__ */ new Date()).toISOString(), sender: meta.did, payload })
    );
  }
  handleChannelDeleteAdmin(ws, meta, msg) {
    const payload = msg.payload;
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, "Not authorized");
      return;
    }
    this.ctx.storage.sql.exec("DELETE FROM channels WHERE id = ?", payload.channelId);
    this.broadcast(
      serialise({ id: msg.id, type: "channel.deleted", timestamp: (/* @__PURE__ */ new Date()).toISOString(), sender: meta.did, payload })
    );
  }
  handleChannelPin(ws, meta, msg) {
    const payload = msg.payload;
    let count3 = 0;
    for (const row of this.ctx.storage.sql.exec(
      "SELECT COUNT(*) as cnt FROM pins WHERE channel_id = ?",
      payload.channelId
    )) {
      count3 = row.cnt;
    }
    if (count3 >= 50) {
      this.sendError(ws, "Max 50 pins per channel");
      return;
    }
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO pins (channel_id, message_id, pinned_by, pinned_at) VALUES (?, ?, ?, ?)",
      payload.channelId,
      payload.messageId,
      meta.did,
      (/* @__PURE__ */ new Date()).toISOString()
    );
    this.broadcast(
      serialise({
        id: msg.id,
        type: "channel.message.pinned",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: meta.did,
        payload
      })
    );
  }
  handleChannelUnpin(_ws, meta, msg) {
    const payload = msg.payload;
    this.ctx.storage.sql.exec(
      "DELETE FROM pins WHERE channel_id = ? AND message_id = ?",
      payload.channelId,
      payload.messageId
    );
    this.broadcast(
      serialise({
        id: msg.id,
        type: "channel.message.unpinned",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: meta.did,
        payload
      })
    );
  }
  handleChannelPinsList(ws, _meta, msg) {
    const payload = msg.payload;
    const pins = [];
    for (const row of this.ctx.storage.sql.exec(
      "SELECT message_id FROM pins WHERE channel_id = ?",
      payload.channelId
    )) {
      pins.push(row.message_id);
    }
    ws.send(
      serialise({
        id: msg.id,
        type: "channel.pins.list.response",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { channelId: payload.channelId, messageIds: pins }
      })
    );
  }
  handleChannelReactionAdd(meta, msg) {
    this.broadcast(
      serialise({
        id: msg.id,
        type: "channel.reaction.added",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: meta.did,
        payload: msg.payload
      })
    );
  }
  handleChannelReactionRemove(meta, msg) {
    this.broadcast(
      serialise({
        id: msg.id,
        type: "channel.reaction.removed",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: meta.did,
        payload: msg.payload
      })
    );
  }
  handleChannelHistory(ws, msg) {
    const payload = msg.payload;
    const graph = `${payload.communityId}:${payload.channelId}`;
    const allMsgs = this.quadStore.match({ predicate: "rdf:type", object: HarmonyType.Message, graph });
    const limit = payload.limit ?? 50;
    const messages = [];
    for (const quad of allMsgs) {
      const id = quad.subject;
      const author = this.quadStore.getValue(id, HarmonyPredicate.author, graph);
      const content = this.quadStore.getValue(id, `${HARMONY}content`, graph);
      const timestamp = this.quadStore.getValue(id, HarmonyPredicate.timestamp, graph);
      if (payload.before && timestamp && timestamp >= payload.before) continue;
      messages.push({ id, author: author ?? "", content: content ?? "", timestamp: timestamp ?? "" });
    }
    messages.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const sliced = messages.slice(0, limit);
    ws.send(
      serialise({
        id: msg.id,
        type: "channel.history.response",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { channelId: payload.channelId, messages: sliced }
      })
    );
  }
  // ── Community (additional) ──
  handleCommunityUpdate(ws, meta, msg) {
    const payload = msg.payload;
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, "Not authorized");
      return;
    }
    if (!this.communityId) return;
    if (payload.name !== void 0) {
      const old = this.quadStore.getValue(this.communityId, HarmonyPredicate.name, this.communityId);
      if (old !== null)
        this.quadStore.remove({
          subject: this.communityId,
          predicate: HarmonyPredicate.name,
          object: old,
          graph: this.communityId
        });
      this.quadStore.add({
        subject: this.communityId,
        predicate: HarmonyPredicate.name,
        object: payload.name,
        graph: this.communityId
      });
    }
    if (payload.description !== void 0) {
      const old = this.quadStore.getValue(this.communityId, `${HARMONY}description`, this.communityId);
      if (old !== null)
        this.quadStore.remove({
          subject: this.communityId,
          predicate: `${HARMONY}description`,
          object: old,
          graph: this.communityId
        });
      this.quadStore.add({
        subject: this.communityId,
        predicate: `${HARMONY}description`,
        object: payload.description,
        graph: this.communityId
      });
    }
    this.broadcast(
      serialise({
        id: msg.id,
        type: "community.updated",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: meta.did,
        payload: { communityId: this.communityId, ...payload }
      })
    );
  }
  handleCommunityInfo(ws, msg) {
    const info3 = this.getCommunityInfo();
    ws.send(
      serialise({
        id: msg.id,
        type: "community.info.response",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: info3
      })
    );
  }
  handleCommunityList(ws, msg) {
    const info3 = this.getCommunityInfo();
    ws.send(
      serialise({
        id: msg.id,
        type: "community.list.response",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { communities: [info3] }
      })
    );
  }
  getCommunityInfo() {
    const name = this.communityId ? this.quadStore.getValue(this.communityId, HarmonyPredicate.name, this.communityId) : null;
    const description = this.communityId ? this.quadStore.getValue(this.communityId, `${HARMONY}description`, this.communityId) : null;
    const members = [];
    for (const row of this.ctx.storage.sql.exec("SELECT did, display_name FROM members")) {
      members.push({ did: row.did, displayName: row.display_name });
    }
    return { communityId: this.communityId, name, description, members };
  }
  handleCommunityBan(ws, meta, msg) {
    const payload = msg.payload;
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, "Not authorized");
      return;
    }
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO banned_users (did, banned_by, banned_at, reason) VALUES (?, ?, ?, ?)",
      payload.did,
      meta.did,
      (/* @__PURE__ */ new Date()).toISOString(),
      payload.reason ?? null
    );
    this.ctx.storage.sql.exec("DELETE FROM members WHERE did = ?", payload.did);
    this.createNotification(payload.did, {
      type: "community.ban",
      fromDID: meta.did,
      communityId: this.communityId ?? void 0,
      content: payload.reason
    });
    for (const target of this.findConnectionsByDID(payload.did)) {
      target.send(
        serialise({
          id: msg.id,
          type: "community.ban.applied",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          sender: "server",
          payload: { did: payload.did, reason: payload.reason }
        })
      );
      target.close(4003, "Banned");
    }
    this.broadcast(
      serialise({
        id: msg.id,
        type: "community.ban.applied",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: meta.did,
        payload: { did: payload.did }
      })
    );
  }
  handleCommunityUnban(ws, meta, msg) {
    const payload = msg.payload;
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, "Not authorized");
      return;
    }
    this.ctx.storage.sql.exec("DELETE FROM banned_users WHERE did = ?", payload.did);
    ws.send(
      serialise({
        id: msg.id,
        type: "community.unban.applied",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { did: payload.did }
      })
    );
  }
  handleCommunityKick(ws, meta, msg) {
    const payload = msg.payload;
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, "Not authorized");
      return;
    }
    this.ctx.storage.sql.exec("DELETE FROM members WHERE did = ?", payload.did);
    for (const target of this.findConnectionsByDID(payload.did)) {
      target.send(
        serialise({
          id: msg.id,
          type: "member.kicked",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          sender: "server",
          payload: { did: payload.did }
        })
      );
      target.close(4004, "Kicked");
    }
    this.broadcast(
      serialise({
        id: msg.id,
        type: "member.kicked",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: meta.did,
        payload: { did: payload.did }
      })
    );
  }
  // ── DM ──
  handleDmSend(ws, meta, msg) {
    const payload = msg.payload;
    const targets = this.findConnectionsByDID(payload.recipientDID);
    if (targets.length === 0) {
      this.sendError(ws, "Recipient not connected");
      return;
    }
    const outMsg = serialise({ id: msg.id, type: "dm.message", timestamp: msg.timestamp, sender: meta.did, payload });
    for (const t of targets) t.send(outMsg);
  }
  handleDmEdit(ws, meta, msg) {
    const payload = msg.payload;
    const targets = this.findConnectionsByDID(payload.recipientDID);
    if (targets.length === 0) {
      this.sendError(ws, "Recipient not connected");
      return;
    }
    const outMsg = serialise({ id: msg.id, type: "dm.edited", timestamp: msg.timestamp, sender: meta.did, payload });
    for (const t of targets) t.send(outMsg);
  }
  handleDmDelete(ws, meta, msg) {
    const payload = msg.payload;
    const targets = this.findConnectionsByDID(payload.recipientDID);
    if (targets.length === 0) {
      this.sendError(ws, "Recipient not connected");
      return;
    }
    const outMsg = serialise({ id: msg.id, type: "dm.deleted", timestamp: msg.timestamp, sender: meta.did, payload });
    for (const t of targets) t.send(outMsg);
  }
  handleDmTyping(_ws, meta, msg) {
    const payload = msg.payload;
    const targets = this.findConnectionsByDID(payload.recipientDID);
    const outMsg = serialise({
      id: msg.id,
      type: "dm.typing.indicator",
      timestamp: msg.timestamp,
      sender: meta.did,
      payload
    });
    for (const t of targets) t.send(outMsg);
  }
  handleDmKeyexchange(_ws, meta, msg) {
    const payload = msg.payload;
    const targets = this.findConnectionsByDID(payload.recipientDID);
    const outMsg = serialise({
      id: msg.id,
      type: "dm.keyexchange",
      timestamp: msg.timestamp,
      sender: meta.did,
      payload
    });
    for (const t of targets) t.send(outMsg);
  }
  // ── Threads ──
  handleThreadCreate(meta, msg) {
    const payload = msg.payload;
    const id = crypto.randomUUID();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.ctx.storage.sql.exec(
      "INSERT INTO threads (id, parent_message_id, channel_id, name, creator_did, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      payload.parentMessageId,
      payload.channelId,
      payload.name,
      meta.did,
      now
    );
    this.broadcast(
      serialise({
        id: msg.id,
        type: "thread.created",
        timestamp: now,
        sender: meta.did,
        payload: { threadId: id, ...payload }
      })
    );
  }
  handleThreadSend(meta, msg) {
    const payload = msg.payload;
    this.ctx.storage.sql.exec("UPDATE threads SET message_count = message_count + 1 WHERE id = ?", payload.threadId);
    this.broadcast(
      serialise({ id: msg.id, type: "thread.message", timestamp: msg.timestamp, sender: meta.did, payload })
    );
  }
  // ── Roles ──
  handleRoleCreate(ws, meta, msg) {
    const payload = msg.payload;
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, "Not authorized");
      return;
    }
    const id = crypto.randomUUID();
    this.ctx.storage.sql.exec(
      "INSERT INTO roles (id, name, color, permissions, position, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      payload.name,
      payload.color ?? null,
      JSON.stringify(payload.permissions ?? []),
      payload.position ?? 0,
      meta.did
    );
    this.broadcast(
      serialise({
        id: msg.id,
        type: "role.created",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: meta.did,
        payload: { roleId: id, ...payload }
      })
    );
  }
  handleRoleUpdate(ws, meta, msg) {
    const payload = msg.payload;
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, "Not authorized");
      return;
    }
    if (payload.name !== void 0)
      this.ctx.storage.sql.exec("UPDATE roles SET name = ? WHERE id = ?", payload.name, payload.roleId);
    if (payload.color !== void 0)
      this.ctx.storage.sql.exec("UPDATE roles SET color = ? WHERE id = ?", payload.color, payload.roleId);
    if (payload.permissions !== void 0)
      this.ctx.storage.sql.exec(
        "UPDATE roles SET permissions = ? WHERE id = ?",
        JSON.stringify(payload.permissions),
        payload.roleId
      );
    if (payload.position !== void 0)
      this.ctx.storage.sql.exec("UPDATE roles SET position = ? WHERE id = ?", payload.position, payload.roleId);
    this.broadcast(
      serialise({ id: msg.id, type: "role.updated", timestamp: (/* @__PURE__ */ new Date()).toISOString(), sender: meta.did, payload })
    );
  }
  handleRoleDelete(ws, meta, msg) {
    const payload = msg.payload;
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, "Not authorized");
      return;
    }
    this.ctx.storage.sql.exec("DELETE FROM roles WHERE id = ?", payload.roleId);
    this.ctx.storage.sql.exec("DELETE FROM member_roles WHERE role_id = ?", payload.roleId);
    this.broadcast(
      serialise({ id: msg.id, type: "role.deleted", timestamp: (/* @__PURE__ */ new Date()).toISOString(), sender: meta.did, payload })
    );
  }
  handleRoleAssign(ws, meta, msg) {
    const payload = msg.payload;
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, "Not authorized");
      return;
    }
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO member_roles (member_did, role_id) VALUES (?, ?)",
      payload.did,
      payload.roleId
    );
    this.broadcast(
      serialise({
        id: msg.id,
        type: "community.member.updated",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: meta.did,
        payload
      })
    );
  }
  handleRoleRemove(ws, meta, msg) {
    const payload = msg.payload;
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, "Not authorized");
      return;
    }
    this.ctx.storage.sql.exec(
      "DELETE FROM member_roles WHERE member_did = ? AND role_id = ?",
      payload.did,
      payload.roleId
    );
    this.broadcast(
      serialise({
        id: msg.id,
        type: "community.member.updated",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: meta.did,
        payload
      })
    );
  }
  // ── Member ──
  handleMemberUpdate(meta, msg) {
    const payload = msg.payload;
    this.ctx.storage.sql.exec("UPDATE members SET display_name = ? WHERE did = ?", payload.displayName, meta.did);
    this.broadcast(
      serialise({
        id: msg.id,
        type: "community.member.updated",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: meta.did,
        payload: { did: meta.did, displayName: payload.displayName }
      })
    );
  }
  // ── Search ──
  handleSearchQuery(ws, msg) {
    const payload = msg.payload;
    const pattern = { predicate: `${HARMONY}content` };
    if (payload.communityId && payload.channelId) {
      ;
      pattern.graph = `${payload.communityId}:${payload.channelId}`;
    }
    const allContent = this.quadStore.match(pattern);
    const queryLower = payload.query.toLowerCase();
    const results = [];
    for (const quad of allContent) {
      if (quad.object.toLowerCase().includes(queryLower)) {
        results.push({ messageId: quad.subject, content: quad.object });
      }
    }
    ws.send(
      serialise({
        id: msg.id,
        type: "search.results",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { query: payload.query, results: results.slice(0, 50) }
      })
    );
  }
  // ── Media ──
  handleMediaUploadRequest(ws, meta, msg) {
    const payload = msg.payload;
    const id = crypto.randomUUID();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.ctx.storage.sql.exec(
      "INSERT INTO media (id, filename, mime_type, size, data, uploaded_by, channel_id, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      payload.filename,
      payload.mimeType,
      payload.size,
      payload.data,
      meta.did,
      payload.channelId,
      now
    );
    ws.send(
      serialise({
        id: msg.id,
        type: "media.upload.complete",
        timestamp: now,
        sender: "server",
        payload: { mediaId: id, filename: payload.filename }
      })
    );
  }
  handleMediaDelete(ws, meta, msg) {
    const payload = msg.payload;
    let uploader = null;
    for (const row of this.ctx.storage.sql.exec("SELECT uploaded_by FROM media WHERE id = ?", payload.mediaId)) {
      uploader = row.uploaded_by;
    }
    if (uploader !== meta.did) {
      this.sendError(ws, "Not authorized");
      return;
    }
    this.ctx.storage.sql.exec("DELETE FROM media WHERE id = ?", payload.mediaId);
    ws.send(
      serialise({
        id: msg.id,
        type: "media.deleted",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { mediaId: payload.mediaId }
      })
    );
  }
  // ── MLS E2EE ──
  handleMlsKeypackageUpload(meta, msg) {
    const payload = msg.payload;
    this.ctx.storage.sql.exec(
      "INSERT INTO key_packages (did, package_data) VALUES (?, ?)",
      meta.did,
      payload.packageData
    );
    void msg;
  }
  handleMlsKeypackageFetch(ws, msg) {
    const payload = msg.payload;
    const packages = {};
    for (const did of payload.dids) {
      packages[did] = [];
      for (const row of this.ctx.storage.sql.exec("SELECT package_data FROM key_packages WHERE did = ?", did)) {
        packages[did].push(row.package_data);
      }
    }
    ws.send(
      serialise({
        id: msg.id,
        type: "mls.keypackage.response",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { packages }
      })
    );
  }
  handleMlsWelcome(_ws, meta, msg) {
    const payload = msg.payload;
    const targets = this.findConnectionsByDID(payload.recipientDID);
    const outMsg = serialise({ id: msg.id, type: "mls.welcome", timestamp: msg.timestamp, sender: meta.did, payload });
    for (const t of targets) t.send(outMsg);
  }
  handleMlsCommit(ws, meta, msg) {
    this.broadcast(
      serialise({ id: msg.id, type: "mls.commit", timestamp: msg.timestamp, sender: meta.did, payload: msg.payload }),
      ws
    );
  }
  handleMlsGroupSetup(_ws, meta, msg) {
    const payload = msg.payload;
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO e2ee_groups (group_id, creator_did, channel_id) VALUES (?, ?, ?)",
      payload.groupId,
      meta.did,
      payload.channelId
    );
    this.broadcast(
      serialise({ id: msg.id, type: "mls.group.setup", timestamp: msg.timestamp, sender: meta.did, payload })
    );
  }
  // ── Moderation ──
  handleModerationConfigUpdate(ws, meta, msg) {
    const payload = msg.payload;
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, "Not authorized");
      return;
    }
    for (const rule of payload.rules) {
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO moderation_rules (id, type, config) VALUES (?, ?, ?)",
        rule.id,
        rule.type,
        rule.config
      );
    }
    ws.send(
      serialise({
        id: msg.id,
        type: "moderation.config.updated",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: {}
      })
    );
  }
  handleModerationConfigGet(ws, msg) {
    const rules = [];
    for (const row of this.ctx.storage.sql.exec("SELECT id, type, config FROM moderation_rules")) {
      rules.push({ id: row.id, type: row.type, config: row.config });
    }
    ws.send(
      serialise({
        id: msg.id,
        type: "moderation.config.response",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { rules }
      })
    );
  }
  // ── Notifications ──
  handleNotificationList(ws, meta) {
    const notifs = [];
    for (const row of this.ctx.storage.sql.exec(
      "SELECT id, type, from_did, community_id, channel_id, message_id, content, read, created_at FROM notifications WHERE recipient_did = ? ORDER BY created_at DESC LIMIT 50",
      meta.did
    )) {
      notifs.push({
        id: row.id,
        type: row.type,
        fromDID: row.from_did,
        communityId: row.community_id,
        channelId: row.channel_id,
        messageId: row.message_id,
        content: row.content,
        read: row.read === 1,
        createdAt: row.created_at
      });
    }
    ws.send(
      serialise({
        id: crypto.randomUUID(),
        type: "notification.list.response",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { notifications: notifs }
      })
    );
  }
  handleNotificationMarkRead(ws, meta, msg) {
    const payload = msg.payload;
    this.ctx.storage.sql.exec(
      "UPDATE notifications SET read = 1 WHERE id = ? AND recipient_did = ?",
      payload.notificationId,
      meta.did
    );
    ws.send(
      serialise({
        id: msg.id,
        type: "notification.marked-read",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { notificationId: payload.notificationId }
      })
    );
  }
  handleNotificationCount(ws, meta) {
    let count3 = 0;
    for (const row of this.ctx.storage.sql.exec(
      "SELECT COUNT(*) as cnt FROM notifications WHERE recipient_did = ? AND read = 0",
      meta.did
    )) {
      count3 = row.cnt;
    }
    ws.send(
      serialise({
        id: crypto.randomUUID(),
        type: "notification.count.response",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { count: count3 }
      })
    );
  }
  // ── Voice (additional) ──
  handleVoiceSignaling(ws, meta, msg) {
    const payload = msg.payload;
    const targets = this.findConnectionsByDID(payload.targetDID);
    if (targets.length === 0) {
      this.sendError(ws, "Target not connected");
      return;
    }
    const outMsg = serialise({
      id: msg.id,
      type: msg.type,
      timestamp: msg.timestamp,
      sender: meta.did,
      payload: msg.payload
    });
    for (const t of targets) t.send(outMsg);
  }
  handleVoiceVideo(meta, msg) {
    const payload = msg.payload;
    this.ctx.storage.sql.exec(
      "UPDATE voice_participants SET video_enabled = ? WHERE room_id = ? AND did = ?",
      payload.videoEnabled ? 1 : 0,
      payload.channelId,
      meta.did
    );
    this.broadcast(
      serialise({
        id: msg.id,
        type: "voice.video.changed",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: meta.did,
        payload
      })
    );
  }
  handleVoiceScreen(meta, msg) {
    this.broadcast(
      serialise({
        id: msg.id,
        type: "voice.screen.changed",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: meta.did,
        payload: msg.payload
      })
    );
  }
  handleVoiceSpeaking(ws, meta, msg) {
    const payload = msg.payload;
    const participants = this.getVoiceParticipants(payload.channelId);
    const outMsg = serialise({
      id: msg.id,
      type: "voice.speaking",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      sender: meta.did,
      payload
    });
    for (const p of participants) {
      if (p.did === meta.did) continue;
      for (const target of this.findConnectionsByDID(p.did, ws)) {
        target.send(outMsg);
      }
    }
  }
  async callCFApi(path, method, body) {
    const appId = this.env.CALLS_APP_ID;
    const appSecret = this.env.CALLS_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error("CF Realtime SFU not configured");
    }
    const url = `https://rtc.live.cloudflare.com/v1/apps/${appId}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${appSecret}`,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : void 0
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`CF API error ${response.status}: ${text}`);
    }
    return response.json();
  }
  async handleVoiceSessionCreate(ws, _meta, msg) {
    try {
      const result = await this.callCFApi("/sessions/new", "POST");
      ws.send(
        serialise({
          id: msg.id,
          type: "voice.session.created",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          sender: "server",
          payload: { sessionId: result.sessionId }
        })
      );
    } catch (err) {
      this.sendError(ws, `CF session create failed: ${err}`);
    }
  }
  async handleVoiceTracksPush(ws, msg) {
    const payload = msg.payload;
    try {
      const result = await this.callCFApi(`/sessions/${payload.sessionId}/tracks/new`, "POST", {
        tracks: payload.tracks,
        sessionDescription: payload.sessionDescription
      });
      ws.send(
        serialise({
          id: msg.id,
          type: "voice.tracks.pushed",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          sender: "server",
          payload: result
        })
      );
    } catch (err) {
      this.sendError(ws, `CF tracks push failed: ${err}`);
    }
  }
  async handleVoiceTracksPull(ws, msg) {
    const payload = msg.payload;
    try {
      const result = await this.callCFApi(`/sessions/${payload.sessionId}/tracks/new`, "POST", {
        tracks: payload.tracks,
        sessionDescription: payload.sessionDescription
      });
      ws.send(
        serialise({
          id: msg.id,
          type: "voice.tracks.pulled",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          sender: "server",
          payload: result
        })
      );
    } catch (err) {
      this.sendError(ws, `CF tracks pull failed: ${err}`);
    }
  }
  async handleVoiceTracksClose(ws, msg) {
    const payload = msg.payload;
    try {
      await this.callCFApi(`/sessions/${payload.sessionId}/tracks/close`, "PUT", {
        tracks: payload.tracks,
        force: payload.force ?? false
      });
      ws.send(
        serialise({
          id: msg.id,
          type: "voice.tracks.closed",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          sender: "server",
          payload: { closed: true }
        })
      );
    } catch (err) {
      this.sendError(ws, `CF tracks close failed: ${err}`);
    }
  }
  handleVoiceGetProducers(ws, meta, msg) {
    let roomId = null;
    for (const row of this.ctx.storage.sql.exec(
      "SELECT room_id FROM voice_participants WHERE did = ? LIMIT 1",
      meta.did
    )) {
      roomId = row.room_id;
    }
    const producers = [];
    if (roomId) {
      for (const row of this.ctx.storage.sql.exec(
        "SELECT track_name, session_id, kind, media_type, did FROM voice_tracks WHERE room_id = ? AND did != ?",
        roomId,
        meta.did
      )) {
        producers.push({
          trackName: row.track_name,
          sessionId: row.session_id,
          kind: row.kind,
          mediaType: row.media_type,
          participantId: row.did
        });
      }
    }
    ws.send(
      serialise({
        id: msg.id,
        type: "voice.get-producers.response",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { producers }
      })
    );
  }
  handleVoiceTrackPublished(_ws, meta, msg) {
    const payload = msg.payload;
    const roomId = payload.roomId;
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO voice_tracks (room_id, did, track_name, session_id, kind, media_type) VALUES (?, ?, ?, ?, ?, ?)",
      roomId,
      meta.did,
      payload.trackName,
      payload.sessionId,
      payload.kind,
      payload.mediaType
    );
    const outMsg = serialise({
      id: `vtp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "voice.track.published",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      sender: meta.did,
      payload: {
        roomId,
        sessionId: payload.sessionId,
        trackName: payload.trackName,
        kind: payload.kind,
        mediaType: payload.mediaType,
        participantId: meta.did
      }
    });
    const participants = this.getVoiceParticipants(roomId);
    for (const p of participants) {
      if (p.did === meta.did) continue;
      for (const target of this.findConnectionsByDID(p.did)) {
        target.send(outMsg);
      }
    }
  }
  handleVoiceTrackRemoved(_ws, meta, msg) {
    const payload = msg.payload;
    const roomId = payload.roomId;
    this.ctx.storage.sql.exec(
      "DELETE FROM voice_tracks WHERE room_id = ? AND did = ? AND track_name = ?",
      roomId,
      meta.did,
      payload.trackName
    );
    const outMsg = serialise({
      id: `vtr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "voice.track.removed",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      sender: meta.did,
      payload: {
        roomId,
        sessionId: payload.sessionId,
        trackName: payload.trackName,
        participantId: meta.did
      }
    });
    const participants = this.getVoiceParticipants(roomId);
    for (const p of participants) {
      if (p.did === meta.did) continue;
      for (const target of this.findConnectionsByDID(p.did)) {
        target.send(outMsg);
      }
    }
  }
  async handleVoiceRenegotiate(ws, msg) {
    const payload = msg.payload;
    try {
      const result = await this.callCFApi(`/sessions/${payload.sessionId}/renegotiate`, "PUT", {
        sessionDescription: payload.sessionDescription
      });
      ws.send(
        serialise({
          id: msg.id,
          type: "voice.renegotiated",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          sender: "server",
          payload: result
        })
      );
    } catch (err) {
      this.sendError(ws, `CF renegotiate failed: ${err}`);
    }
  }
  handleVoiceToken(ws, msg) {
    const hasCF = !!this.env.CALLS_APP_ID && !!this.env.CALLS_APP_SECRET;
    const mode = hasCF ? "cf" : "signaling";
    const token = btoa(JSON.stringify({ mode, timestamp: Date.now() }));
    ws.send(
      serialise({
        id: msg.id,
        type: "voice.token.response",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { token, mode }
      })
    );
  }
  handleVoiceProducerClosed(_ws, meta, msg) {
    const payload = msg.payload;
    const participants = this.getVoiceParticipants(payload.channelId);
    const outMsg = serialise({
      id: msg.id,
      type: "voice.producer-closed",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      sender: meta.did,
      payload
    });
    for (const p of participants) {
      if (p.did === meta.did) continue;
      for (const target of this.findConnectionsByDID(p.did)) {
        target.send(outMsg);
      }
    }
  }
  // ── Helpers ──
  findConnectionsByDID(did, exclude) {
    const result = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const meta = ws.deserializeAttachment();
      if (meta.did === did) result.push(ws);
    }
    return result;
  }
  isAdmin(did) {
    if (!this.communityId) return false;
    const creator = this.quadStore.getValue(this.communityId, `${HARMONY}creator`, this.communityId);
    return creator === did;
  }
  isBanned(did) {
    for (const _row of this.ctx.storage.sql.exec("SELECT 1 FROM banned_users WHERE did = ?", did)) {
      return true;
    }
    return false;
  }
  createNotification(recipientDID, opts) {
    const id = `notif-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.ctx.storage.sql.exec(
      "INSERT INTO notifications (id, recipient_did, type, from_did, community_id, channel_id, message_id, content, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
      id,
      recipientDID,
      opts.type,
      opts.fromDID,
      opts.communityId ?? null,
      opts.channelId ?? null,
      opts.messageId ?? null,
      opts.content ?? null,
      now
    );
    for (const ws of this.findConnectionsByDID(recipientDID)) {
      ws.send(
        serialise({
          id,
          type: "notification.new",
          timestamp: now,
          sender: "server",
          payload: {
            id,
            type: opts.type,
            fromDID: opts.fromDID,
            communityId: opts.communityId,
            channelId: opts.channelId,
            messageId: opts.messageId,
            content: opts.content,
            read: false,
            createdAt: now
          }
        })
      );
    }
  }
  ensureMember(did) {
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO members (did, joined_at) VALUES (?, ?)",
      did,
      (/* @__PURE__ */ new Date()).toISOString()
    );
  }
  sendError(ws, message, code) {
    ws.send(
      serialise({
        id: crypto.randomUUID(),
        type: "error",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sender: "server",
        payload: { message, ...code ? { code } : {} }
      })
    );
  }
  broadcast(message, exclude) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== exclude) {
        try {
          ws.send(message);
        } catch {
        }
      }
    }
  }
};

// src/index.ts
var src_default = {
  async fetch(request, env2) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }
    if (url.pathname.startsWith("/api/instances")) {
      return handleProvisioningRequest(request, env2);
    }
    if (url.pathname.startsWith("/ws/") || url.pathname === "/ws") {
      const communityId = url.pathname.split("/")[2] || url.searchParams.get("community");
      if (!communityId) {
        return new Response("Missing community ID", { status: 400 });
      }
      const doId = env2.COMMUNITY.idFromName(communityId);
      const stub = env2.COMMUNITY.get(doId);
      return stub.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  }
};

// ../../node_modules/.pnpm/wrangler@4.68.0_@cloudflare+workers-types@4.20260303.0/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env2, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env2);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../node_modules/.pnpm/wrangler@4.68.0_@cloudflare+workers-types@4.20260303.0/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env2, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env2);
  } catch (e) {
    const error3 = reduceError(e);
    return Response.json(error3, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-oUtlDa/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [middleware_ensure_req_body_drained_default, middleware_miniflare3_json_error_default];
var middleware_insertion_facade_default = src_default;

// ../../node_modules/.pnpm/wrangler@4.68.0_@cloudflare+workers-types@4.20260303.0/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env2, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env2, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env2, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env2, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-oUtlDa/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env2, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env2, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env2, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(Date.now(), init.cron ?? "", () => {
          });
          return worker.scheduled(controller, env2, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env2, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env2, ctx) => {
      this.env = env2;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(Date.now(), init.cron ?? "", () => {
        });
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(request, this.env, this.ctx, this.#dispatcher, this.#fetchDispatcher);
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  CommunityDurableObject,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
