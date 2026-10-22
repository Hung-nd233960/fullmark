---
title: Rust basics
description: Ownership, borrowing, `String` and `&str`, `Vec`, `match` and `Option`. All code is Rust 2021.
id: rust-basics
time_limit: 25m
feedback: end
shuffle_choices: true
tags: [rust]
---

# Ownership and borrowing

## What happens when you compile this program? {tags=ownership}

```rust
fn main() {
    let s1 = String::from("hi");
    let s2 = s1;
    println!("{}", s1);
}
```

- [ ] It prints `hi`
- [x] A compile error: `s1` was moved to `s2`
- [ ] A compile error: `s2` is never used
- [ ] It prints `hi` twice

> [!explanation]
> `String` owns heap data and does not implement `Copy`, so `let s2 = s1;` moves ownership. Using `s1` afterwards is error E0382 (borrow of moved value). Unused variables only produce warnings.

## Which of these snippets compile? {type=multi points=2 tags=ownership}

Each snippet is the whole body of `fn main()`.

- [x]

  ```rust
  let s = String::from("a");
  let t = s.clone();
  println!("{} {}", s, t);
  ```

- [ ]

  ```rust
  let v = vec![1];
  let w = v;
  println!("{:?}", v);
  ```

- [x]

  ```rust
  let mut n = 1;
  let r = &mut n;
  *r += 1;
  println!("{}", n);
  ```

- [x]

  ```rust
  let x = 5;
  let y = x;
  println!("{} {}", x, y);
  ```

- [ ]

  ```rust
  let x = 5;
  x = 6;
  println!("{}", x);
  ```

> [!explanation]
> `clone` makes a second owned value, so both can be used. A `Vec` is moved by `let w = v;`. The mutable reference `r` is last used before `n` is read again, so the borrow has ended. Integers are `Copy`. Assigning twice to a non-`mut` binding is error E0384.

## Which line does the compiler reject? {tags=borrowing}

```rust
fn main() {
    let mut v = vec![1, 2, 3];
    let a = &mut v;
    let b = &mut v;
    a.push(4);
    b.push(5);
}
```

- [ ] `let a = &mut v;`
- [x] `let b = &mut v;`
- [ ] `a.push(4);`
- [ ] `b.push(5);`

> [!explanation]
> `a` is still used by `a.push(4)`, so the second mutable borrow on the line `let b = &mut v;` is rejected (E0499: more than one mutable borrow at a time).

## At any one time you may have either one mutable reference or any number of shared references to a value, but not both. {type=truefalse tags=borrowing}

```answer
value: true
```

> [!explanation]
> This is the core borrowing rule. It prevents data races and iterator invalidation at compile time.

## Make it compile. {type=blanks points=2 tags=borrowing}

Fill in the two missing pieces.

```rust
fn print_len(v: &Vec<i32>) {
    println!("{}", v.len());
}

fn main() {
    let [[mut]] v = Vec::new();
    v.push(1);
    print_len([[&]]v);
}
```

> [!explanation]
> `push` needs a mutable binding, so `let mut v`. `print_len` takes a shared reference, so the call is `print_len(&v)`.

# Values and control flow

## What does this program print? {type=short case=sensitive tags=basics}

```rust
fn main() {
    println!("{}", 7 / 2);
}
```

```answer
accept: ["3"]
```

> [!explanation]
> Both operands are integers, so `/` is integer division and truncates toward zero. Use `7.0 / 2.0` to get `3.5`.

## What does this program print? Write the two lines separated by a space. {type=short case=sensitive tags=basics}

```rust
fn main() {
    let x = 5;
    let x = x * 2;
    {
        let x = x + 1;
        println!("{}", x);
    }
    println!("{}", x);
}
```

```answer
accept: ["11 10"]
```

> [!explanation]
> Shadowing creates a new binding. Inside the block `x` is `10 + 1 = 11`; after the block the outer `x` (`10`) is visible again.

## What does `v.pop()` return when `v` is a `Vec<i32>`? {tags=collections}

- [ ] `i32`
- [x] `Option<i32>`
- [ ] `Result<i32, String>`
- [ ] `&i32`

> [!explanation]
> The vector might be empty, so `pop` returns `Some(last)` or `None`.

## What does this program print? {tags=pattern-matching}

```rust
fn main() {
    let x: Option<i32> = Some(3);
    match x {
        Some(n) if n > 5 => println!("big"),
        Some(n) => println!("small {}", n),
        None => println!("none"),
    }
}
```

- [ ] `big`
- [x] `small 3`
- [ ] `none`
- [ ] Nothing: the program does not compile

> [!explanation]
> The first arm's guard `n > 5` is false for `3`, so the second arm matches.

# Write some code

## Write `largest`. {type=code points=3 tags=functions}

Return the largest value in a non-empty slice of `i32`.

```answer
language: rust
starter: |
  fn largest(v: &[i32]) -> i32 {
      todo!()
  }
rubric:
  - Correct for every non-empty slice, including one element and negative numbers
  - Does not clone or allocate unnecessarily
  - Idiomatic use of iterators or a simple loop
reference: |
  fn largest(v: &[i32]) -> i32 {
      *v.iter().max().unwrap()
  }
show_reference: true
```
