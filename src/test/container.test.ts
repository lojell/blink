import * as assert from "assert";
import { Container, token, Inject } from "../di/container.js";

suite("Container", () => {
  test("get returns what the factory produced", () => {
    const c = new Container();
    const NUM = token<number>("num");
    c.register(NUM, () => 42);
    assert.strictEqual(c.get(NUM), 42);
  });

  test("factory is not invoked until first get (lazy)", () => {
    const c = new Container();
    const NUM = token<number>("num");
    let calls = 0;
    c.register(NUM, () => {
      calls++;
      return 1;
    });
    assert.strictEqual(calls, 0);
    c.get(NUM);
    assert.strictEqual(calls, 1);
  });

  test("get caches: one factory invocation, same instance", () => {
    const c = new Container();
    const OBJ = token<{ n: number }>("obj");
    let calls = 0;
    c.register(OBJ, () => {
      calls++;
      return { n: calls };
    });
    const a = c.get(OBJ);
    const b = c.get(OBJ);
    assert.strictEqual(a, b);
    assert.strictEqual(calls, 1);
  });

  test("a factory resolves its dependencies via the container, order-independent", () => {
    const c = new Container();
    const DEP = token<string>("dep");
    const TOP = token<string>("top");
    c.register(TOP, (di) => `top(${di.get(DEP)})`);
    c.register(DEP, () => "dep"); // registered after its consumer
    assert.strictEqual(c.get(TOP), "top(dep)");
  });

  test("re-register before instantiation replaces the factory (last wins)", () => {
    const c = new Container();
    const NUM = token<number>("num");
    c.register(NUM, () => 1);
    c.register(NUM, () => 2);
    assert.strictEqual(c.get(NUM), 2);
  });

  test("re-register after instantiation throws", () => {
    const c = new Container();
    const NUM = token<number>("num");
    c.register(NUM, () => 1);
    c.get(NUM);
    assert.throws(() => c.register(NUM, () => 2), /num/);
  });

  test("get on an unregistered token throws naming the token", () => {
    const c = new Container();
    const MISSING = token<number>("missing-thing");
    assert.throws(() => c.get(MISSING), /missing-thing/);
  });

  test("circular dependency throws with the chain", () => {
    const c = new Container();
    const A = token<string>("a");
    const B = token<string>("b");
    c.register(A, (di) => di.get(B));
    c.register(B, (di) => di.get(A));
    assert.throws(() => c.get(A), /a -> b -> a/);
  });

  test("register(token, class) resolves bare token decorators on constructor params", () => {
    const c = new Container();
    const DEP = token<string>("dep");
    const SVC = token<Svc>("svc");
    class Svc {
      constructor(@DEP public readonly dep: string) {}
    }
    c.register(DEP, () => "hello");
    c.register(SVC, Svc);
    assert.strictEqual(c.get(SVC).dep, "hello");
  });

  test("the @Token() factory form works too", () => {
    const c = new Container();
    const DEP = token<string>("dep");
    const SVC = token<Svc>("svc");
    class Svc {
      constructor(@DEP() public readonly dep: string) {}
    }
    c.register(DEP, () => "hi");
    c.register(SVC, Svc);
    assert.strictEqual(c.get(SVC).dep, "hi");
  });

  test("register(token, class) caches a lazy singleton under the bound token", () => {
    const c = new Container();
    const SVC = token<Svc>("svc");
    let calls = 0;
    class Svc {
      constructor() {
        calls++;
      }
    }
    c.register(SVC, Svc);
    assert.strictEqual(calls, 0);
    assert.strictEqual(c.get(SVC), c.get(SVC));
    assert.strictEqual(calls, 1);
  });

  test("bound classes chain: a decorated token dep of another bound class resolves", () => {
    const c = new Container();
    const LEAF = token<Leaf>("leaf");
    const ROOT = token<Root>("root");
    class Leaf {
      readonly name = "leaf";
    }
    class Root {
      constructor(@LEAF public readonly leaf: Leaf) {}
    }
    c.register(ROOT, Root); // registered before its dependency: order-independent
    c.register(LEAF, Leaf);
    assert.strictEqual(c.get(ROOT).leaf.name, "leaf");
  });

  test("a class given alone registers as its own key", () => {
    const c = new Container();
    class Leaf {
      readonly name = "leaf";
    }
    c.register(Leaf);
    assert.strictEqual(c.get(Leaf).name, "leaf");
    assert.strictEqual(c.get(Leaf), c.get(Leaf));
  });

  test("concrete-class deps inject via @Inject(Class)", () => {
    const c = new Container();
    class Leaf {
      readonly name = "leaf";
    }
    const ROOT = token<Root>("root");
    class Root {
      constructor(@Inject(Leaf) public readonly leaf: Leaf) {}
    }
    c.register(ROOT, Root);
    c.register(Leaf);
    assert.strictEqual(c.get(ROOT).leaf.name, "leaf");
  });

  test("registering a class whose required params lack decorators throws", () => {
    const c = new Container();
    const SVC = token<unknown>("svc");
    class Undecorated {
      constructor(public readonly dep: string) {}
    }
    assert.throws(() => c.register(SVC, Undecorated), /decorator/);
  });

  test("registering a token without an implementation throws", () => {
    const c = new Container();
    const SVC = token<unknown>("svc");
    assert.throws(() => c.register(SVC as never), /implementation|factory|class/);
  });

  test("a factory can register under a class key", () => {
    const c = new Container();
    class Sized {
      constructor(public readonly n: number) {}
    }
    c.register(Sized, () => new Sized(100));
    assert.strictEqual(c.get(Sized).n, 100);
  });

  test("get on an unregistered class key throws naming the class", () => {
    const c = new Container();
    class Missing {}
    assert.throws(() => c.get(Missing), /Missing/);
  });
});
