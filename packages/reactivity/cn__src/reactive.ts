import { isObject, toTypeString } from '@vue/shared'
import { mutableHandlers, readonlyHandlers } from './baseHandlers'

import {
  mutableCollectionHandlers,
  readonlyCollectionHandlers
} from './collectionHandlers'

import { UnwrapNestedRefs } from './ref'
import { ReactiveEffect } from './effect'

// The main WeakMap that stores {target -> key -> dep} connections.
// Conceptually, it's easier to think of a dependency as a Dep class
// which maintains a Set of subscribers, but we simply store them as
// raw Sets to reduce memory overhead.
export type Dep = Set<ReactiveEffect>
export type KeyToDepMap = Map<string | symbol, Dep>
export const targetMap = new WeakMap<any, KeyToDepMap>()

// WeakMaps that store {raw <-> observed} pairs.
const rawToReactive = new WeakMap<any, any>()
const reactiveToRaw = new WeakMap<any, any>()
const rawToReadonly = new WeakMap<any, any>()
const readonlyToRaw = new WeakMap<any, any>()

// WeakSets for values that are marked readonly or non-reactive during
// observable creation.
const readonlyValues = new WeakSet<any>()
const nonReactiveValues = new WeakSet<any>()

const collectionTypes = new Set<Function>([Set, Map, WeakMap, WeakSet])
const observableValueRE = /^\[object (?:Object|Array|Map|Set|WeakMap|WeakSet)\]$/

const canObserve = (value: any): boolean => {
  return (
    !value._isVue &&
    !value._isVNode &&
    observableValueRE.test(toTypeString(value)) &&
    !nonReactiveValues.has(value)
  )
}

export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
export function reactive(target: object) {
  // if trying to observe a readonly proxy, return the readonly version.
  // 如果这个对象是只读的，直接返回
  if (readonlyToRaw.has(target)) {
    return target
  }
  // target is explicitly marked as readonly by user
  // 对象被用户明确的标记为只读
  if (readonlyValues.has(target)) {
    return readonly(target)
  }

  // 创建一个可响应的对象
  return createReactiveObject(
    target,
    rawToReactive,
    reactiveToRaw,
    mutableHandlers,
    mutableCollectionHandlers
  )
}

export function readonly<T extends object>(
  target: T
): Readonly<UnwrapNestedRefs<T>>
export function readonly(target: object) {
  // value is a mutable observable, retrieve its original and return
  // a readonly version.
  // 值是一个可变的观察过的值，找到它的原始值并且返回一个只读版本。
  if (reactiveToRaw.has(target)) {
    target = reactiveToRaw.get(target)
  }

  // 如果target已经被观察过了，找到它的原始值
  return createReactiveObject(
    target,
    rawToReadonly,
    readonlyToRaw,
    readonlyHandlers,
    readonlyCollectionHandlers
  )
}

function createReactiveObject(
  target: any,
  toProxy: WeakMap<any, any>,
  toRaw: WeakMap<any, any>,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>
) {
  // 1. 如果target是null或者基本类型值，则直接返回
  if (!isObject(target)) {
    if (__DEV__) {
      console.warn(`value cannot be made reactive: ${String(target)}`)
    }
    return target
  }
  // target already has corresponding Proxy
  let observed = toProxy.get(target)
  // 2. 如果target已经被代理过了，直接返回被代理过后的值
  if (observed !== void 0) {
    return observed
  }
  // target is already a Proxy
  // 3. 如果target是一个被代理过的值，直接返回target
  if (toRaw.has(target)) {
    return target
  }
  // only a whitelist of value types can be observed. 只有在白名单中的值才能被观测
  // 3. 如果target是vue实例或者vnode实例，或者不是[Set, Map, WeakMap, WeakSet, Object, Array]中的任意一个，或者被明确标记(markNoReactive)为不做观察，都直接返回
  if (!canObserve(target)) {
    return target
  }

  // 4. 如果target是Set、WeakSet、Map、WeakMap，则用collectionHandlers，否则用baseHandlers
  const handlers = collectionTypes.has(target.constructor)
    ? collectionHandlers
    : baseHandlers

  // 5. 对对象做代理
  observed = new Proxy(target, handlers)

  // 6. 将代理后的对象收集进对应的Map中
  toProxy.set(target, observed)
  toRaw.set(observed, target)

  // 7. 如果targetMap中没有target，则在targetMap中以target为key，初始化一个值为Map的实例
  if (!targetMap.has(target)) {
    targetMap.set(target, new Map())
  }

  // 8. 返回代理后的对象
  return observed
}

export function isReactive(value: any): boolean {
  return reactiveToRaw.has(value) || readonlyToRaw.has(value)
}

export function isReadonly(value: any): boolean {
  return readonlyToRaw.has(value)
}

export function toRaw<T>(observed: T): T {
  return reactiveToRaw.get(observed) || readonlyToRaw.get(observed) || observed
}

export function markReadonly<T>(value: T): T {
  readonlyValues.add(value)
  return value
}

export function markNonReactive<T>(value: T): T {
  nonReactiveValues.add(value)
  return value
}
