---
title: "Kitchen sink"
description: Every question type, with *math*, code, an image and audio.
id: all-types
time_limit: 20m
feedback: instant
pass_mark: 50
tags: [test]
---

# Choices {time=5m}

This section checks **choice** questions. Inline math: $a^2 + b^2 = c^2$.

## Which ion drives phase 3 repolarization? {id=single1 tags=cardio}

- [ ] Na⁺
- [x] K⁺
- [ ] Ca²⁺

> [!hint]
> Think about repolarization, not depolarization.

> [!explanation]
> Delayed-rectifier K⁺ currents dominate phase 3.

## Select all that are even {id=multi1 type=multi points=2}

- [x] $2$
- [ ] $3$
- [x] $4$

> [!explanation]
> Even numbers are divisible by 2.

## Every differentiable function is continuous. {id=tf1 type=truefalse}

```answer
value: true
```

> [!explanation]
> Differentiability implies continuity.

# Typed answers

## Evaluate $\int_0^1 x^2\,dx$. {id=num1 type=numeric}

Display math too:

$$
\int_0^1 x^2\,dx = \frac{x^3}{3}\Big|_0^1
$$

```answer
value: 0.3333
tolerance: 0.001
```

> [!explanation]
> The antiderivative is $x^3/3$.

## What does `println!("{}", 7 / 2);` print? {id=short1 type=short case=sensitive}

```answer
accept: ["3"]
```

> [!explanation]
> Integer division truncates.

## Complete the rules. {id=blanks1 type=blanks points=2}

The derivative of $\sin x$ is [[cos x|cos(x)]], and a half is [[=0.5±0.01]].

> [!explanation]
> Standard results.

## Make it compile. {id=blanks2 type=blanks}

```rust
fn main() {
    let [[mut]] v = Vec::new();
    v.push(1);
    println!("{}", v.len());
}
```

> [!explanation]
> `push` needs a mutable binding.

## Fill in the parts. {id=fields1 type=fields points=3}

![A gradient](assets/gradient.png)

```answer
fields:
  - label: "$f'(x)$ ="
    accept: ["3x^2-3", "3x^2 - 3"]
  - label: "Number of critical points"
    value: 2
  - label: "Anything you like (not graded)"
```

> [!explanation]
> Differentiate term by term.

# Written work

Listen to the tone before answering.

![A short beep](assets/beep.wav)

## Describe the tone. {id=essay1 type=essay points=5}

```answer
min_words: 5
max_words: 50
rubric:
  - Task achievement: covers pitch and length
  - Coherence and cohesion
```

## Write `largest`. {id=code1 type=code points=3}

Return the largest value in a non-empty slice.

```answer
language: rust
starter: |
  fn largest(v: &[i32]) -> i32 {
      todo!()
  }
rubric:
  - Correct for all non-empty slices
reference: |
  fn largest(v: &[i32]) -> i32 {
      *v.iter().max().unwrap()
  }
show_reference: true
```

# Order and match

## Put the steps of a proof by induction in order. {id=ord1 type=ordering points=2}

1. Check the base case.
2. Assume the claim holds for $n = k$.
3. Prove it for $n = k + 1$.
4. Conclude it holds for every $n$.

> [!explanation]
> The base case comes first, then the inductive step, then the conclusion.

## Match each language to its tool. {id=match1 type=matching points=3}

- Rust :: cargo
- Python :: pip
- JavaScript :: npm
- :: make

> [!explanation]
> Each language has its own package manager; `make` is a distractor.
