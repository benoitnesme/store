import {
  PlainObjectOf,
  ɵStateClass,
  ɵMETA_KEY,
  ɵMETA_OPTIONS_KEY,
  ɵSELECTOR_META_KEY
} from '@ngxs/store/internals';
import { Observable } from 'rxjs';

import { NgxsConfig, StoreOptions } from '../symbols';
import { ActionHandlerMetaData } from '../actions/symbols';

// inspired from https://stackoverflow.com/a/43674389
export interface StateClassInternal<T = any, U = any> extends ɵStateClass<T> {
  [ɵMETA_KEY]?: MetaDataModel;
  [ɵMETA_OPTIONS_KEY]?: StoreOptions<U>;
}

export type StateKeyGraph = PlainObjectOf<string[]>;
export type StatesByName = PlainObjectOf<StateClassInternal>;

export interface StateOperations<T> {
  getState(): T;

  setState(val: T): T;

  dispatch(actionOrActions: any | any[]): Observable<void>;
}

export interface MetaDataModel {
  name: string | null;
  actions: PlainObjectOf<ActionHandlerMetaData[]>;
  defaults: any;
  path: string | null;
  makeRootSelector: SelectorFactory | null;
  children?: StateClassInternal[];
}

export interface RuntimeSelectorContext {
  getStateGetter(key: any): (state: any) => any;
  getSelectorOptions(localOptions?: SharedSelectorOptions): SharedSelectorOptions;
}

export type SelectFromRootState = (rootState: any) => any;
export type SelectorFactory = (runtimeContext: RuntimeSelectorContext) => SelectFromRootState;

export interface SharedSelectorOptions {
  injectContainerState?: boolean;
  suppressErrors?: boolean;
}

export interface SelectorMetaDataModel {
  makeRootSelector: SelectorFactory | null;
  originalFn: Function | null;
  containerClass: any;
  selectorName: string | null;
  getSelectorOptions: () => SharedSelectorOptions;
}

export interface MappedStore {
  name: string;
  isInitialised: boolean;
  actions: PlainObjectOf<ActionHandlerMetaData[]>;
  defaults: any;
  instance: any;
  path: string;
}

export interface StatesAndDefaults {
  defaults: any;
  states: MappedStore[];
}

/**
 * Ensures metadata is attached to the class and returns it.
 *
 * @ignore
 */
export function ensureStoreMetadata(target: StateClassInternal): MetaDataModel {
  if (!target.hasOwnProperty(ɵMETA_KEY)) {
    const defaultMetadata: MetaDataModel = {
      name: null,
      actions: {},
      defaults: {},
      path: null,
      makeRootSelector(context: RuntimeSelectorContext) {
        return context.getStateGetter(defaultMetadata.name);
      },
      children: []
    };

    Object.defineProperty(target, ɵMETA_KEY, { value: defaultMetadata });
  }
  return getStoreMetadata(target);
}

/**
 * Get the metadata attached to the state class if it exists.
 *
 * @ignore
 */
export function getStoreMetadata(target: StateClassInternal): MetaDataModel {
  return target[ɵMETA_KEY]!;
}

/**
 * Ensures metadata is attached to the selector and returns it.
 *
 * @ignore
 */
export function ensureSelectorMetadata(target: Function): SelectorMetaDataModel {
  if (!target.hasOwnProperty(ɵSELECTOR_META_KEY)) {
    const defaultMetadata: SelectorMetaDataModel = {
      makeRootSelector: null,
      originalFn: null,
      containerClass: null,
      selectorName: null,
      getSelectorOptions: () => ({})
    };

    Object.defineProperty(target, ɵSELECTOR_META_KEY, { value: defaultMetadata });
  }

  return getSelectorMetadata(target);
}

/**
 * Get the metadata attached to the selector if it exists.
 *
 * @ignore
 */
export function getSelectorMetadata(target: any): SelectorMetaDataModel {
  return target[ɵSELECTOR_META_KEY];
}

/**
 * Get a deeply nested value. Example:
 *
 *    getValue({ foo: bar: [] }, 'foo.bar') //=> []
 *
 * Note: This is not as fast as the `fastPropGetter` but is strict Content Security Policy compliant.
 * See perf hit: https://jsperf.com/fast-value-getter-given-path/1
 *
 * @ignore
 */
function compliantPropGetter(paths: string[]): (x: any) => any {
  const copyOfPaths = paths.slice();
  return obj => copyOfPaths.reduce((acc: any, part: string) => acc && acc[part], obj);
}

/**
 * The generated function is faster than:
 * - pluck (Observable operator)
 * - memoize
 *
 * @ignore
 */
function fastPropGetter(paths: string[]): (x: any) => any {
  const segments = paths;
  let seg = 'store.' + segments[0];
  let i = 0;
  const l = segments.length;

  let expr = seg;
  while (++i < l) {
    expr = expr + ' && ' + (seg = seg + '.' + segments[i]);
  }

  const fn = new Function('store', 'return ' + expr + ';');

  return <(x: any) => any>fn;
}

/**
 * Get a deeply nested value. Example:
 *
 *    getValue({ foo: bar: [] }, 'foo.bar') //=> []
 *
 * @ignore
 */
export function propGetter(paths: string[], config: NgxsConfig) {
  if (config && config.compatibility && config.compatibility.strictContentSecurityPolicy) {
    return compliantPropGetter(paths);
  } else {
    return fastPropGetter(paths);
  }
}

/**
 * Given an array of states, it will return a object graph. Example:
 *    const states = [
 *      Cart,
 *      CartSaved,
 *      CartSavedItems
 *    ]
 *
 * would return:
 *
 *  const graph = {
 *    cart: ['saved'],
 *    saved: ['items'],
 *    items: []
 *  };
 *
 * @ignore
 */
export function buildGraph(stateClasses: StateClassInternal[]): StateKeyGraph {
  const findName = (stateClass: StateClassInternal) => {
    const meta = stateClasses.find(g => g === stateClass);

    // Caretaker note: we have still left the `typeof` condition in order to avoid
    // creating a breaking change for projects that still use the View Engine.
    if ((typeof ngDevMode === 'undefined' || ngDevMode) && !meta) {
      throw new Error(
        `Child state not found: ${stateClass}. \r\nYou may have forgotten to add states to module`
      );
    }

    return meta![ɵMETA_KEY]!.name!;
  };

  return stateClasses.reduce<StateKeyGraph>(
    (result: StateKeyGraph, stateClass: StateClassInternal) => {
      const { name, children } = stateClass[ɵMETA_KEY]!;
      result[name!] = (children || []).map(findName);
      return result;
    },
    {}
  );
}

/**
 * Given a states array, returns object graph
 * returning the name and state metadata. Example:
 *
 *  const graph = {
 *    cart: { metadata }
 *  };
 *
 * @ignore
 */
export function nameToState(states: StateClassInternal[]): PlainObjectOf<StateClassInternal> {
  return states.reduce<PlainObjectOf<StateClassInternal>>(
    (result: PlainObjectOf<StateClassInternal>, stateClass: StateClassInternal) => {
      const meta = stateClass[ɵMETA_KEY]!;
      result[meta.name!] = stateClass;
      return result;
    },
    {}
  );
}

/**
 * Given a object relationship graph will return the full path
 * for the child items. Example:
 *
 *  const graph = {
 *    cart: ['saved'],
 *    saved: ['items'],
 *    items: []
 *  };
 *
 * would return:
 *
 *  const r = {
 *    cart: 'cart',
 *    saved: 'cart.saved',
 *    items: 'cart.saved.items'
 *  };
 *
 * @ignore
 */
export function findFullParentPath(
  obj: StateKeyGraph,
  newObj: PlainObjectOf<string> = {}
): PlainObjectOf<string> {
  const visit = (child: StateKeyGraph, keyToFind: string): string | null => {
    for (const key in child) {
      if (child.hasOwnProperty(key) && child[key].indexOf(keyToFind) >= 0) {
        const parent = visit(child, key);
        return parent !== null ? `${parent}.${key}` : key;
      }
    }
    return null;
  };

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const parent = visit(obj, key);
      newObj[key] = parent ? `${parent}.${key}` : key;
    }
  }

  return newObj;
}

/**
 * Given a object graph, it will return the items topologically sorted Example:
 *
 *  const graph = {
 *    cart: ['saved'],
 *    saved: ['items'],
 *    items: []
 *  };
 *
 * would return:
 *
 *  const results = [
 *    'items',
 *    'saved',
 *    'cart'
 *  ];
 *
 * @ignore
 */
export function topologicalSort(graph: StateKeyGraph): string[] {
  const sorted: string[] = [];
  const visited: PlainObjectOf<boolean> = {};

  const visit = (name: string, ancestors: string[] = []) => {
    if (!Array.isArray(ancestors)) {
      ancestors = [];
    }

    ancestors.push(name);
    visited[name] = true;

    graph[name].forEach((dep: string) => {
      // Caretaker note: we have still left the `typeof` condition in order to avoid
      // creating a breaking change for projects that still use the View Engine.
      if ((typeof ngDevMode === 'undefined' || ngDevMode) && ancestors.indexOf(dep) >= 0) {
        throw new Error(
          `Circular dependency '${dep}' is required by '${name}': ${ancestors.join(' -> ')}`
        );
      }

      if (visited[dep]) {
        return;
      }

      visit(dep, ancestors.slice(0));
    });

    if (sorted.indexOf(name) < 0) {
      sorted.push(name);
    }
  };

  Object.keys(graph).forEach(k => visit(k));

  return sorted.reverse();
}

/**
 * Returns if the parameter is a object or not.
 *
 * @ignore
 */
export function isObject(obj: any) {
  return (typeof obj === 'object' && obj !== null) || typeof obj === 'function';
}
