/**
 * Branded injection token, callable as a parameter decorator: the phantom
 * `__type` member carries T so token-typed resolution is compile-checked even
 * for interface seams (which have no runtime identity). Use bare
 * (`@ILogger dep: ILogger`) or as a factory (`@ILogger()`). Never set
 * `__type` at runtime.
 */
export interface Token<T> {
  (target: object, propertyKey: string | symbol | undefined, parameterIndex: number): void;
  (): ParameterDecorator;
  readonly id: symbol;
  readonly __type?: T;
}

/**
 * Anything that can identify a registration: a Token, or a class acting as
 * its own key (interface seams need tokens — interfaces have no runtime
 * identity — but a concrete class is already a unique runtime value).
 */
export type InjectionKey<T> = Token<T> | (new (...args: never[]) => T);

type AnyCtor<T = unknown> = new (...args: never[]) => T;

/** Constructor-parameter keys recorded by decorators, per class, by index. */
const paramKeys = new WeakMap<object, Array<InjectionKey<unknown> | undefined>>();

function recordParam(target: object, index: number, key: InjectionKey<unknown>): void {
  const keys = paramKeys.get(target) ?? [];
  keys[index] = key;
  paramKeys.set(target, keys);
}

export function token<T>(description: string): Token<T> {
  const tok = function (...args: unknown[]) {
    if (args.length >= 3 && typeof args[2] === "number") {
      // bare form: @TOKEN — invoked directly as the parameter decorator
      recordParam(args[0] as object, args[2] as number, tok);
      return;
    }
    // factory form: @TOKEN()
    return (target: object, _propertyKey: string | symbol | undefined, parameterIndex: number) =>
      recordParam(target, parameterIndex, tok);
  } as Token<T>;
  Object.defineProperty(tok, "id", { value: Symbol(description) });
  return tok;
}

/**
 * Parameter decorator for concrete-class dependencies, which can't be their
 * own decorator (calling a class without `new` throws):
 * `@Inject(StatusStore) store: StatusStore`. Works for tokens too.
 */
export function Inject(key: InjectionKey<unknown>): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => recordParam(target as object, parameterIndex, key);
}

function isToken(key: unknown): key is Token<unknown> {
  return typeof key === "function" && "id" in key;
}

/**
 * Minimal DI container: lazy singleton resolution with circular-dependency
 * detection. Bind a token to a class, register a concrete class as its own
 * key, or register a factory for value-configured deps. Constructor params
 * declare their keys via decorators (@TOKEN or @Inject(Class)); registration
 * validates that every parameter is decorated. Pure — no vscode. Only
 * extension.ts touches the container; classes know their keys, never the
 * container.
 */
export class Container {
  private readonly factories = new Map<symbol | Function, (c: Container) => unknown>();
  private readonly instances = new Map<symbol | Function, unknown>();
  private readonly resolving: InjectionKey<unknown>[] = [];

  register<T>(cls: AnyCtor<T>): this;
  register<T>(key: InjectionKey<T>, factory: (c: Container) => T): this;
  register<T>(key: InjectionKey<T>, cls: AnyCtor<T>): this;
  register(
    a: InjectionKey<unknown> | AnyCtor,
    b?: AnyCtor | ((c: Container) => unknown),
  ): this {
    if (b === undefined) {
      if (isToken(a)) {
        throw new Error(
          `blink di: token "${this.describe(a)}" needs an implementation: register(token, class) or register(token, factory)`,
        );
      }
      return this.set(a, this.classFactory(a as AnyCtor));
    }
    if (typeof b === "function" && this.isClass(b)) {
      return this.set(a as InjectionKey<unknown>, this.classFactory(b as AnyCtor));
    }
    return this.set(a as InjectionKey<unknown>, b as (c: Container) => unknown);
  }

  get<T>(key: InjectionKey<T>): T {
    const id = this.keyOf(key);
    if (this.instances.has(id)) {
      return this.instances.get(id) as T;
    }
    const factory = this.factories.get(id);
    if (!factory) {
      throw new Error(`blink di: no factory registered for "${this.describe(key)}"`);
    }
    if (this.resolving.some((k) => this.keyOf(k) === id)) {
      const chain = [...this.resolving, key].map((k) => this.describe(k)).join(" -> ");
      throw new Error(`blink di: circular dependency: ${chain}`);
    }
    this.resolving.push(key);
    try {
      const instance = factory(this);
      this.instances.set(id, instance);
      return instance as T;
    } finally {
      this.resolving.pop();
    }
  }

  /** Build a factory from the class's decorator-recorded parameter keys. */
  private classFactory(cls: AnyCtor): (c: Container) => unknown {
    const keys = paramKeys.get(cls) ?? [];
    if (keys.length < cls.length) {
      throw new Error(
        `blink di: class ${cls.name} has ${cls.length} required constructor parameter(s) but only ${keys.length} carry an injection decorator (@TOKEN or @Inject(Class))`,
      );
    }
    for (let i = 0; i < keys.length; i++) {
      if (!keys[i]) {
        throw new Error(`blink di: class ${cls.name} constructor parameter ${i} is missing an injection decorator`);
      }
    }
    return (c) => new cls(...(keys.map((k) => c.get(k as InjectionKey<unknown>)) as never[]));
  }

  private set(key: InjectionKey<unknown>, factory: (c: Container) => unknown): this {
    const id = this.keyOf(key);
    if (this.instances.has(id)) {
      throw new Error(`blink di: cannot re-register "${this.describe(key)}" after it was instantiated`);
    }
    this.factories.set(id, factory);
    return this;
  }

  private keyOf(key: InjectionKey<unknown>): symbol | Function {
    return isToken(key) ? key.id : key;
  }

  private describe(key: InjectionKey<unknown>): string {
    return isToken(key) ? String(key.id.description) : key.name;
  }

  /** A class has a non-writable prototype property; factories (arrows/plain functions) don't. */
  private isClass(fn: Function): boolean {
    const proto = Object.getOwnPropertyDescriptor(fn, "prototype");
    return proto !== undefined && proto.writable === false;
  }
}
