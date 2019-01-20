import { env, stderr } from "deno";
import { ms } from "https://raw.githubusercontent.com/denolib/ms/master/ms.ts";
import { selectColor, coerce } from "./utils.ts";
import format from "./format.ts";

interface DebugFunction {
  (...args: any[]): void;
}

interface DebugInstance {
  (...args: any[]): void;
  namespace: string;
  enabled: boolean;
  color: number;
  destroy: () => boolean;
  extend: (namespace: string, delimiter?: string) => DebugInstance;
  log: Function | void;
}

// Default export public API
interface Debug {
  (namespace: string): DebugInstance;
  enable: (namespaces: any) => void;
  disable: () => string;
  enabled: (namespace: string) => boolean;
  names: RegExp[];
  skips: RegExp[];
  formatters: Formatters;
}

interface Formatters {
  [key: string]: (value: any) => string;
}

const currentEnv = env();

/**
 * Active `debug` instances.
 */
let instances: DebugInstance[] = [];
/**
 * The currently active debug mode names, and names to skip.
 */
let names: RegExp[] = [];
let skips: RegExp[] = [];

let formatters = {};

createDebug.enable = enable;
createDebug.disable = disable;
createDebug.enabled = enabled;
createDebug.names = names;
createDebug.skips = skips;
createDebug.formatters = formatters;

const debugExport: Debug = createDebug;
export default debugExport;

// Enable namespaces passed from env
enable(currentEnv.DEBUG);

/**
 * Save `namespaces` to env.
 */
function updateNamespacesEnv(namespaces: string): void {
  if (namespaces) {
    currentEnv.DEBUG = namespaces;
  } else {
    delete currentEnv.DEBUG;
  }
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 */
export function enabled(namespace: string): boolean {
  if (namespace[namespace.length - 1] === "*") {
    return true;
  }

  for (const skip of skips) {
    if (skip.test(namespace)) {
      return false;
    }
  }
  for (const name of names) {
    if (name.test(namespace)) {
      return true;
    }
  }

  return false;
}

export function enable(namespaces: any) {
  updateNamespacesEnv(namespaces);

  // Resets enabled and disable namespaces
  names = [];
  skips = [];

  // Splits on comma
  // Loops through the passed namespaces
  // And groups them in enabled and disabled lists
  (typeof namespaces === "string" ? namespaces : "")
    .split(/[\s,]+/)
    .map(namespace => namespace.replace(/\*/g, ".*?"))
    .forEach(ns => {
      // Ignore empty strings
      if (!ns) return;

      // If a namespace starts with `-`, we should disable that namespace
      if (ns[0] === "-") {
        skips.push(new RegExp("^" + ns.slice(1) + "$"));
      } else {
        names.push(new RegExp("^" + ns + "$"));
      }
    });

  instances.forEach(instance => {
    instance.enabled = enabled(instance.namespace);
  });
}

/**
 * Disable debug output.
 */
export function disable(): string {
  const namespaces = [
    ...names.map(regexpToNamespace),
    ...skips.map(regexpToNamespace).map(namespace => `-${namespace}`)
  ].join(",");
  enable("");
  return namespaces;
}

/**
 * Convert regexp to namespace
 *
 * @param {RegExp} regxep
 * @return {String} namespace
 * @api private
 */
function regexpToNamespace(regexp: RegExp): string {
  return regexp
    .toString()
    .substring(2, regexp.toString().length - 2)
    .replace(/\.\*\?$/, "*");
}

interface PrettifyLogOptions {
  namespace: string;
  color: number;
  diff: number;
}

interface LoggerFunction {
  (...args: any): string;
}

// Usage
// const prettyLog = prettifyLog({ namespace, color, diff })(debug.log || defaultLog)
// prettyLog(fmt, ...args)
//
// or
//
// const prettyLog = prettifyLog({ namespace, color, diff })(fmt, ...args)
// const logger = debug.log || defaultLog;
// logger(prettyLog)
// Deno only
function prettifyLog({
  namespace,
  color,
  diff
}: PrettifyLogOptions): LoggerFunction {
  return (...args: any) => {
    const colorCode = "\u001B[3" + (color < 8 ? color : "8;5;" + color);
    const prefix = `  ${colorCode};1m${namespace} \u001B[0m`;
    const result = `${prefix}${format(...args)} ${colorCode}m+${ms(
      diff
    )}${"\u001B[0m"}`;
    return result;
  };
}

function defaultLogger(msg: string): void {
  stderr.write(new TextEncoder().encode(msg + "\n"));
}

function applyFormatters(args: any[]): any[] {
  args[0] = coerce(args[0]);

  if (typeof args[0] !== "string") {
    // Anything else let's inspect with %O
    args.unshift("%O");
  }

  // Apply any `formatters` transformations
  let index = 0;
  args[0] = (args[0] as string).replace(/%([a-zA-Z%])/g, (match, format) => {
    // If we encounter an escaped % then don't increase the array index
    if (match === "%%") {
      return match;
    }
    index++;
    const formatter = createDebug.formatters[format];
    if (typeof formatter === "function") {
      const val = args[index];
      match = formatter.call(this, val);

      // Now we need to remove `args[index]` since it's inlined in the `format`
      args.splice(index, 1);
      index--;
    }
    return match;
  });

  return args;
}

// SINGLE DEBUG INSTANCE

function createDebug(namespace: string): DebugInstance {
  let currTime: number;
  let prevTime: number;
  let diff: number;
  const color = selectColor(namespace);

  let debug: DebugInstance;

  // @ts-ignore
  debug = function(...args: any[]) {
    // Skip if debugger is disabled
    if (!debug.enabled) {
      return;
    }

    // Set `diff` timestamp
    currTime = Number(new Date());
    // Difference in miliseconds
    diff = currTime - (prevTime || currTime);
    prevTime = currTime;

    // Apply all custom formatters to our arguments
    const customFormattedArgs = applyFormatters.call(debug, args);

    // Format the string to be logged
    const prettyLog = prettifyLog({ namespace, color, diff })(
      ...customFormattedArgs
    );
    // Use custom logger if set
    const logger = debug.log || defaultLogger;
    // Finally, log
    logger(prettyLog);
  };

  function destroy() {
    const index = instances.indexOf(this);
    if (index !== -1) {
      instances.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * const server = debug('server');
   * const serverHttp = server.extend('http') // server:http
   * const serverHttpReq = serverHttp.extend('req', '-') // server:http-req
   */
  function extend(subNamespace: string, delimiter: string = ":") {
    const newNamespace = `${namespace}${delimiter}${subNamespace}`;
    const newDebug = createDebug(newNamespace);
    // Pass down the custom logger
    newDebug.log = this.log;
    return newDebug;
  }

  Object.assign(debug, {
    namespace,
    color,
    destroy,
    extend,
    enabled: enabled(namespace)
  });

  instances.push(debug);

  return debug;
}
